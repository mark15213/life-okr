'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { format, startOfWeek, endOfWeek, subWeeks, isWithinInterval, parseISO } from 'date-fns';
import { motion } from 'framer-motion';
import { Layers, Timer, CheckCircle2 } from 'lucide-react';
import type { DailyRecord, CategoryStatRow, CategoryKey } from '@/lib/db';
import { TASK_LISTS } from '@/lib/ticktick/lists';
import { cn } from '@/lib/utils';

type CategoryMetric = 'focus' | 'tasks';

/**
 * Order is load-bearing twice over: it is the stacking order (so it fixes which colors sit
 * against each other), and this exact sequence is what the palette was validated in —
 * every adjacent pair clears the CVD and normal-vision separation floors. Reordering these
 * without re-validating can put two indistinguishable hues next to each other.
 *
 * Uncategorized is deliberately the one neutral: it is the "everything else" bucket and
 * should recede rather than compete with the four real lists.
 */
const CATEGORY_META: Array<{ key: CategoryKey; label: string; color: string }> = [
    { key: 'work', label: 'Work', color: TASK_LISTS.work.color },
    { key: 'study', label: 'Study', color: TASK_LISTS.study.color },
    { key: 'hustle', label: 'Hustle', color: TASK_LISTS.hustle.color },
    { key: 'life', label: 'Life', color: TASK_LISTS.life.color },
    // Uncategorized borrows the Inbox neutral rather than defining a sixth colour, and the
    // two really are the same bucket: Inbox focus has no resolvable list name, so it lands
    // in uncategorized on the way through the sync.
    { key: 'uncategorized', label: 'Uncategorized', color: TASK_LISTS.inbox.color },
];

/**
 * The four categories that come from a real TickTick list. Uncategorized is NOT here on
 * purpose: it is derived as `total − these four`, never read from its stored row.
 *
 * The stored uncategorized row is already inside `focus_minutes_ticktick`, so subtracting
 * all five would count that time twice — once in the stack, once inside the total. Deriving
 * it instead also sweeps in every manual `+` entry (which has no category) for free, and
 * makes days with no category rows at all render as 100% uncategorized.
 */
const STACKED_CATEGORIES = ['work', 'study', 'hustle', 'life'] as const;

const METRIC_META: Record<CategoryMetric, {
    label: string;
    icon: typeof Timer;
    recordValue: (r: DailyRecord) => number;
    rowValue: (r: CategoryStatRow) => number;
    format: (v: number) => string;
}> = {
    focus: {
        label: 'Focus Time',
        icon: Timer,
        recordValue: (r) => r.focus_minutes,
        rowValue: (r) => r.focus_minutes,
        format: (v) => {
            const h = Math.floor(v / 60);
            const m = v % 60;
            return h > 0 ? `${h}h ${m}m` : `${m}m`;
        },
    },
    tasks: {
        label: 'Tasks',
        icon: CheckCircle2,
        recordValue: (r) => r.tasks_completed,
        rowValue: (r) => r.tasks_completed,
        format: (v) => `${v}`,
    },
};

interface CategoryBreakdownProps {
    records: DailyRecord[];
}

function CategoryTooltip({ active, payload, metric }: {
    active?: boolean;
    payload?: Array<{ name: string; value: number; color: string; payload: { fullLabel?: string } }>;
    metric: CategoryMetric;
}) {
    if (!active || !payload || payload.length === 0) return null;
    const total = payload.reduce((s, e) => s + (e.value ?? 0), 0);
    const fmt = METRIC_META[metric].format;

    return (
        <div className="bg-white/95 backdrop-blur-lg rounded-xl border border-zinc-200/60 shadow-xl p-4 min-w-[200px]">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                {payload[0]?.payload?.fullLabel}
            </p>
            <div className="space-y-2">
                {[...payload].reverse().map((entry, i) => (
                    <div key={i} className="flex items-center justify-between gap-6">
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                            <span className="text-sm text-zinc-600">{entry.name}</span>
                        </div>
                        <span className="text-sm font-semibold text-zinc-900">{fmt(entry.value ?? 0)}</span>
                    </div>
                ))}
            </div>
            <div className="flex items-center justify-between gap-6 mt-2 pt-2 border-t border-zinc-100">
                <span className="text-sm text-zinc-400">Total</span>
                <span className="text-sm font-bold text-zinc-900">{fmt(total)}</span>
            </div>
        </div>
    );
}

export default function CategoryBreakdown({ records }: CategoryBreakdownProps) {
    const [metric, setMetric] = useState<CategoryMetric>('focus');

    // Own SWR call, deliberately kept out of the page's loading gate: if this route fails
    // (say, deployed before the migration ran) the rest of Analytics must still render.
    const fetcher = (url: string) => fetch(url).then((res) => res.json());
    const { data } = useSWR('/api/records/categories?days=365', fetcher);

    const { weeklyData, thisWeekShare, weekTotal } = useMemo(() => {
        // Unwrapped inside the callback so the `?? []` fallback doesn't mint a new array
        // identity on every render and defeat this memo.
        const categoryRows: CategoryStatRow[] = data?.entries ?? [];
        const meta = METRIC_META[metric];

        // date -> named-category values. Uncategorized is never read from here.
        const namedByDate = new Map<string, Record<string, number>>();
        for (const row of categoryRows) {
            if (row.category === 'uncategorized') continue;
            const bucket = namedByDate.get(row.date) ?? {};
            bucket[row.category] = (bucket[row.category] ?? 0) + meta.rowValue(row);
            namedByDate.set(row.date, bucket);
        }

        // Resolve every date to a full five-way split BEFORE any week rollup. Doing the
        // residual at week level would let a negative day cancel a positive one and quietly
        // distort the whole bar.
        const perDate = records.map((r) => {
            const named = namedByDate.get(r.date) ?? {};
            const total = meta.recordValue(r);
            const namedSum = STACKED_CATEGORIES.reduce((s, c) => s + (named[c] ?? 0), 0);
            return {
                date: r.date,
                work: named.work ?? 0,
                study: named.study ?? 0,
                hustle: named.hustle ?? 0,
                life: named.life ?? 0,
                uncategorized: Math.max(0, total - namedSum),
            };
        });

        // Week bucketing mirrors DashboardAnalytics exactly (weekStartsOn: 0, 12 weeks back)
        // so these bars line up with the Focus Time line in the trends chart above.
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const aggregate = (start: Date, end: Date) => {
            const acc: Record<CategoryKey, number> = {
                work: 0, study: 0, hustle: 0, life: 0, uncategorized: 0,
            };
            for (const d of perDate) {
                if (!isWithinInterval(parseISO(d.date), { start, end })) continue;
                for (const { key } of CATEGORY_META) acc[key] += d[key];
            }
            return acc;
        };

        const weeklyData = [];
        for (let i = 11; i >= 0; i--) {
            const ws = startOfWeek(subWeeks(today, i), { weekStartsOn: 0 });
            const we = endOfWeek(subWeeks(today, i), { weekStartsOn: 0 });
            const agg = aggregate(ws, we);
            weeklyData.push({
                label: `W${format(ws, 'ww')}`,
                fullLabel: `${format(ws, 'MMM d')} – ${format(we, 'MMM d')}`,
                ...Object.fromEntries(CATEGORY_META.map((c) => [c.label, agg[c.key]])),
            });
        }

        const current = aggregate(
            startOfWeek(today, { weekStartsOn: 0 }),
            endOfWeek(today, { weekStartsOn: 0 })
        );
        const weekTotal = CATEGORY_META.reduce((s, c) => s + current[c.key], 0);
        const thisWeekShare = CATEGORY_META.map((c) => ({
            ...c,
            value: current[c.key],
            pct: weekTotal > 0 ? Math.round((current[c.key] / weekTotal) * 100) : 0,
        }));

        return { weeklyData, thisWeekShare, weekTotal };
    }, [records, data, metric]);

    if (!records || records.length === 0) return null;

    const fmt = METRIC_META[metric].format;

    return (
        <section>
            <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Layers className="w-4 h-4" />
                By Category
            </h3>

            <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-zinc-200/60 shadow-[0_4px_20px_rgb(0,0,0,0.03)]"
            >
                {/* Metric toggle */}
                <div className="flex flex-wrap items-center gap-2 mb-6">
                    {(Object.keys(METRIC_META) as CategoryMetric[]).map((key) => {
                        const Icon = METRIC_META[key].icon;
                        return (
                            <button
                                key={key}
                                onClick={() => setMetric(key)}
                                className={cn(
                                    "px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 border flex items-center gap-1.5",
                                    metric === key
                                        ? "bg-zinc-900 text-white border-transparent shadow-md"
                                        : "bg-white/80 text-zinc-500 border-zinc-200/60 hover:text-zinc-800 hover:border-zinc-300 shadow-sm"
                                )}
                            >
                                <Icon className="w-3.5 h-3.5" />
                                {METRIC_META[key].label}
                            </button>
                        );
                    })}
                </div>

                {/* This-week share — also the direct-label layer, so identity never rests on color alone */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
                    {thisWeekShare.map((c) => (
                        <div key={c.key} className="p-3 rounded-xl bg-zinc-50/80 border border-zinc-100">
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                                <span className="text-xs font-medium text-zinc-500 truncate">{c.label}</span>
                            </div>
                            <div className="text-lg font-bold text-zinc-900 tracking-tight">{fmt(c.value)}</div>
                            <div className="text-xs text-zinc-400">{c.pct}% this week</div>
                        </div>
                    ))}
                </div>

                <div className="h-[340px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={weeklyData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                            <XAxis
                                dataKey="label"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#a1a1aa', fontSize: 11 }}
                                dy={10}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#a1a1aa', fontSize: 11 }}
                                dx={-5}
                            />
                            <Tooltip
                                content={<CategoryTooltip metric={metric} />}
                                cursor={{ fill: '#f4f4f5' }}
                            />
                            <Legend
                                iconType="circle"
                                iconSize={8}
                                wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
                            />
                            {CATEGORY_META.map((c, i) => (
                                <Bar
                                    key={c.key}
                                    dataKey={c.label}
                                    stackId="category"
                                    fill={c.color}
                                    // 1.5px of surface between segments so adjacent fills stay
                                    // legible where two categories meet.
                                    stroke="#ffffff"
                                    strokeWidth={1.5}
                                    barSize={22}
                                    radius={i === CATEGORY_META.length - 1 ? [4, 4, 0, 0] : undefined}
                                    animationDuration={800}
                                />
                            ))}
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {weekTotal === 0 && (
                    <p className="text-xs text-zinc-400 text-center mt-4">
                        No {METRIC_META[metric].label.toLowerCase()} recorded this week yet.
                    </p>
                )}
            </motion.div>
        </section>
    );
}

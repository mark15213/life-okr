'use client';

import { useState, useMemo } from 'react';
import {
    ComposedChart, Line, XAxis, YAxis,
    CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
    format, startOfWeek, endOfWeek, subWeeks, subDays,
    isWithinInterval, parseISO, isSameWeek
} from 'date-fns';
import { DailyRecord } from '@/lib/db';
import { motion, AnimatePresence } from 'framer-motion';
import {
    TrendingUp, TrendingDown, Minus, Timer,
    CheckCircle2, Dumbbell, ChevronDown, ChevronUp,
    Table2, BarChart3, CalendarDays, Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import PeriodicBarChart from './PeriodicBarChart';

type MetricKey = 'focus' | 'tasks' | 'exercises' | 'tokens';
type DeepDiveTab = 'chart' | 'table';

type DailyRecordWithTokens = DailyRecord & { total_tokens?: number };

interface DashboardAnalyticsProps {
    records: DailyRecordWithTokens[];
}

const METRICS_CONFIG: Record<MetricKey, {
    label: string;
    color: string;
    icon: typeof Timer;
    extractValue: (r: DailyRecord) => number;
    metricLabel: string;
    chartTitle: string;
    formatValue: (v: number) => string;
}> = {
    focus: {
        label: 'Focus Time',
        color: '#8b5cf6',
        icon: Timer,
        extractValue: (r) => r.focus_minutes,
        metricLabel: 'min',
        chartTitle: 'Focus Time',
        formatValue: (v) => {
            const h = Math.floor(v / 60);
            const m = v % 60;
            return h > 0 ? `${h}h ${m}m` : `${m}m`;
        },
    },
    tasks: {
        label: 'Tasks',
        color: '#22c55e',
        icon: CheckCircle2,
        extractValue: (r) => r.tasks_completed,
        metricLabel: 'tasks',
        chartTitle: 'Tasks Completed',
        formatValue: (v) => `${v}`,
    },
    exercises: {
        label: 'Exercises',
        color: '#0ea5e9',
        icon: Dumbbell,
        extractValue: (r) => r.exercises,
        metricLabel: 'sets',
        chartTitle: 'Exercise Sets',
        formatValue: (v) => `${v}`,
    },
    tokens: {
        label: 'AI Tokens',
        color: '#ec4899',
        icon: Sparkles,
        extractValue: (r) => (r as DailyRecordWithTokens).total_tokens ?? 0,
        metricLabel: 'tokens',
        chartTitle: 'AI Token Usage',
        formatValue: (v) => {
            if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
            if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
            return String(v);
        },
    },
};

const METRIC_KEYS: MetricKey[] = ['focus', 'tasks', 'exercises', 'tokens'];

function pctChange(current: number, previous: number): { value: number; label: string; direction: 'up' | 'down' | 'neutral' } {
    if (previous === 0 && current === 0) return { value: 0, label: '—', direction: 'neutral' };
    if (previous === 0) return { value: 100, label: '+∞', direction: 'up' };
    const pct = Math.round(((current - previous) / previous) * 100);
    if (pct === 0) return { value: 0, label: '0%', direction: 'neutral' };
    return {
        value: Math.abs(pct),
        label: `${pct > 0 ? '+' : ''}${pct}%`,
        direction: pct > 0 ? 'up' : 'down'
    };
}

function ChangeIndicator({ change }: { change: ReturnType<typeof pctChange> }) {
    return (
        <span className={cn(
            "inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full",
            change.direction === 'up' && "text-emerald-700 bg-emerald-50",
            change.direction === 'down' && "text-red-600 bg-red-50",
            change.direction === 'neutral' && "text-zinc-500 bg-zinc-100"
        )}>
            {change.direction === 'up' && <TrendingUp className="w-3 h-3" />}
            {change.direction === 'down' && <TrendingDown className="w-3 h-3" />}
            {change.direction === 'neutral' && <Minus className="w-3 h-3" />}
            {change.label}
        </span>
    );
}

const TREND_LINE_TO_METRIC: Record<string, MetricKey> = {
    'Focus Time': 'focus',
    'Tasks': 'tasks',
    'Exercises': 'exercises',
    'AI Tokens': 'tokens',
};

// Custom tooltip for the weekly trends chart
function WeeklyTrendTooltip({ active, payload, label }: any) {
    if (!active || !payload || payload.length === 0) return null;
    const dataPoint = payload[0]?.payload;

    return (
        <div className="bg-white/95 backdrop-blur-lg rounded-xl border border-zinc-200/60 shadow-xl p-4 min-w-[200px]">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                {dataPoint?.fullLabel || label}
            </p>
            <div className="space-y-2">
                {payload.map((entry: any, i: number) => {
                    const metricKey = TREND_LINE_TO_METRIC[entry.name as string];
                    const display = metricKey
                        ? METRICS_CONFIG[metricKey].formatValue(entry.value)
                        : entry.value;
                    return (
                        <div key={i} className="flex items-center justify-between gap-6">
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                                <span className="text-sm text-zinc-600">{entry.name}</span>
                            </div>
                            <span className="text-sm font-semibold text-zinc-900">{display}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// Daily detail table for selected week
function WeeklyDetailTable({ records, weekOffset }: { records: DailyRecordWithTokens[]; weekOffset: number }) {
    const today = new Date();
    const targetWeekStart = startOfWeek(subWeeks(today, weekOffset), { weekStartsOn: 0 });

    const weekDays = Array.from({ length: 7 }, (_, i) => {
        const day = new Date(targetWeekStart);
        day.setDate(day.getDate() + i);
        return day;
    });

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-zinc-200/60">
                        <th className="text-left py-3 px-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Day</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Date</th>
                        {METRIC_KEYS.map(key => (
                            <th key={key} className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider" style={{ color: METRICS_CONFIG[key].color }}>
                                {METRICS_CONFIG[key].label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {weekDays.map((day, i) => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        const record = records.find(r => r.date.startsWith(dateStr));
                        const isToday = format(today, 'yyyy-MM-dd') === dateStr;
                        const isFuture = day > today;

                        return (
                            <tr
                                key={dateStr}
                                className={cn(
                                    "border-b border-zinc-100/80 transition-colors",
                                    isToday && "bg-violet-50/50",
                                    isFuture && "opacity-30",
                                    !isToday && !isFuture && "hover:bg-zinc-50/80"
                                )}
                            >
                                <td className="py-3 px-4 font-medium text-zinc-600">
                                    {dayNames[i]}
                                    {isToday && <span className="ml-2 text-[10px] font-bold text-violet-500 uppercase">Today</span>}
                                </td>
                                <td className="py-3 px-4 text-zinc-400">{format(day, 'MMM d')}</td>
                                {METRIC_KEYS.map(key => (
                                    <td key={key} className="text-right py-3 px-4 font-semibold text-zinc-800">
                                        {isFuture ? '—' : (record ? METRICS_CONFIG[key].formatValue(METRICS_CONFIG[key].extractValue(record)) : '0')}
                                    </td>
                                ))}
                            </tr>
                        );
                    })}
                </tbody>
                {/* Weekly total row */}
                <tfoot>
                    <tr className="bg-zinc-50/80">
                        <td className="py-3 px-4 font-bold text-zinc-700" colSpan={2}>Week Total</td>
                        {METRIC_KEYS.map(key => {
                            const weekRecords = records.filter(r => {
                                const rd = parseISO(r.date);
                                return isSameWeek(rd, targetWeekStart, { weekStartsOn: 0 });
                            });
                            const total = weekRecords.reduce((s, r) => s + METRICS_CONFIG[key].extractValue(r), 0);
                            return (
                                <td key={key} className="text-right py-3 px-4 font-bold" style={{ color: METRICS_CONFIG[key].color }}>
                                    {METRICS_CONFIG[key].formatValue(total)}
                                </td>
                            );
                        })}
                    </tr>
                </tfoot>
            </table>
        </div>
    );
}

export default function DashboardAnalytics({ records }: DashboardAnalyticsProps) {
    const [deepDiveTab, setDeepDiveTab] = useState<DeepDiveTab>('chart');
    const [selectedChartMetric, setSelectedChartMetric] = useState<MetricKey>('focus');
    const [tableWeekOffset, setTableWeekOffset] = useState(0);

    // ───── Weekly aggregation ─────
    const { weeklyKPIs, weeklyTrendData } = useMemo(() => {
        if (!records || records.length === 0) return { weeklyKPIs: [], weeklyTrendData: [] };

        const sorted = [...records].sort((a, b) =>
            new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Aggregate one week of records
        const aggregateWeek = (weekStart: Date, weekEnd: Date) => {
            const recs = sorted.filter(r => {
                const rd = parseISO(r.date);
                return isWithinInterval(rd, { start: weekStart, end: weekEnd });
            });
            const result: Record<string, number> = { count: recs.length };
            for (const key of METRIC_KEYS) {
                result[key] = recs.reduce((s, r) => s + METRICS_CONFIG[key].extractValue(r), 0);
            }
            return result;
        };

        // This week & last week for KPI cards
        const thisWeekStart = startOfWeek(today, { weekStartsOn: 0 });
        const thisWeekEnd = endOfWeek(today, { weekStartsOn: 0 });
        const lastWeekStart = startOfWeek(subWeeks(today, 1), { weekStartsOn: 0 });
        const lastWeekEnd = endOfWeek(subWeeks(today, 1), { weekStartsOn: 0 });

        const thisWeek = aggregateWeek(thisWeekStart, thisWeekEnd);
        const lastWeek = aggregateWeek(lastWeekStart, lastWeekEnd);

        const weeklyKPIs = METRIC_KEYS.map(key => {
            const config = METRICS_CONFIG[key];
            const current = thisWeek[key];
            const previous = lastWeek[key];
            return {
                key,
                label: config.label,
                icon: config.icon,
                color: config.color,
                currentValue: config.formatValue(current),
                previousValue: config.formatValue(previous),
                change: pctChange(current, previous),
            };
        });

        // 12-week trend data
        const weeklyTrendData = [];
        for (let i = 11; i >= 0; i--) {
            const ws = startOfWeek(subWeeks(today, i), { weekStartsOn: 0 });
            const we = endOfWeek(subWeeks(today, i), { weekStartsOn: 0 });
            const agg = aggregateWeek(ws, we);

            // Compute week number
            const weekNum = format(ws, 'ww');
            const rangeLabel = `${format(ws, 'MMM d')} – ${format(we, 'MMM d')}`;

            weeklyTrendData.push({
                label: `W${weekNum}`,
                fullLabel: rangeLabel,
                shortLabel: format(ws, 'M/d'),
                'Focus Time': agg['focus'],
                'Tasks': agg['tasks'],
                'Exercises': agg['exercises'],
                'AI Tokens': agg['tokens'],
                isCurrent: i === 0,
            });
        }

        return { weeklyKPIs, weeklyTrendData };
    }, [records]);

    if (!records || records.length === 0) return null;

    const tableWeekLabel = tableWeekOffset === 0
        ? 'This Week'
        : tableWeekOffset === 1
            ? 'Last Week'
            : `${tableWeekOffset} Weeks Ago`;

    return (
        <div className="w-full space-y-8">
            {/* ═══════════════ Section A: Weekly Pulse ═══════════════ */}
            <section>
                <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <CalendarDays className="w-4 h-4" />
                    Weekly Pulse
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {weeklyKPIs.map((kpi, i) => {
                        const Icon = kpi.icon;
                        return (
                            <motion.div
                                key={kpi.key}
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.07 }}
                                className="group relative p-6 rounded-2xl bg-white/80 backdrop-blur-md border border-zinc-200/60 shadow-[0_4px_20px_rgb(0,0,0,0.03)] overflow-hidden"
                            >
                                {/* Subtle accent bar at top */}
                                <div
                                    className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl opacity-60"
                                    style={{ background: `linear-gradient(90deg, ${kpi.color}, ${kpi.color}40)` }}
                                />
                                <div className="flex items-center gap-2 mb-4 text-zinc-400">
                                    <Icon className="w-4 h-4" />
                                    <span className="text-xs font-semibold uppercase tracking-widest">{kpi.label}</span>
                                </div>
                                <div className="text-3xl font-bold text-zinc-900 mb-2 tracking-tight">
                                    {kpi.currentValue}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-zinc-400">vs last week {kpi.previousValue}</span>
                                    <ChangeIndicator change={kpi.change} />
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </section>

            {/* ═══════════════ Section B: Weekly Trends ═══════════════ */}
            <section>
                <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    12-Week Trends
                </h3>
                <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-zinc-200/60 shadow-[0_4px_20px_rgb(0,0,0,0.03)]"
                >
                    <div className="h-[380px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={weeklyTrendData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                                <defs>
                                    {METRIC_KEYS.map(key => (
                                        <linearGradient key={key} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={METRICS_CONFIG[key].color} stopOpacity={0.15} />
                                            <stop offset="100%" stopColor={METRICS_CONFIG[key].color} stopOpacity={0} />
                                        </linearGradient>
                                    ))}
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                                <XAxis
                                    dataKey="label"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#a1a1aa', fontSize: 11 }}
                                    dy={10}
                                />
                                {/* Left Y axis — Focus (minutes, larger scale) */}
                                <YAxis
                                    yAxisId="left"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#a1a1aa', fontSize: 11 }}
                                    dx={-5}
                                />
                                {/* Right Y axis — Tasks & Exercises (smaller scale) */}
                                <YAxis
                                    yAxisId="right"
                                    orientation="right"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#a1a1aa', fontSize: 11 }}
                                    dx={5}
                                />
                                {/* Hidden tokens axis — keeps the AI Tokens line scaled to its own
                                    millions-range so it doesn't squash the focus/tasks/exercises lines.
                                    The tooltip still reports the raw token count. */}
                                <YAxis yAxisId="tokens" hide domain={[0, 'auto']} />
                                <Tooltip content={<WeeklyTrendTooltip />} />
                                <Legend
                                    iconType="circle"
                                    iconSize={8}
                                    wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
                                />
                                <Line
                                    yAxisId="left"
                                    type="monotone"
                                    dataKey="Focus Time"
                                    stroke={METRICS_CONFIG.focus.color}
                                    strokeWidth={2.5}
                                    dot={{ r: 3, fill: METRICS_CONFIG.focus.color, strokeWidth: 0 }}
                                    activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                                    animationDuration={1200}
                                />
                                <Line
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="Tasks"
                                    stroke={METRICS_CONFIG.tasks.color}
                                    strokeWidth={2.5}
                                    dot={{ r: 3, fill: METRICS_CONFIG.tasks.color, strokeWidth: 0 }}
                                    activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                                    animationDuration={1200}
                                />
                                <Line
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="Exercises"
                                    stroke={METRICS_CONFIG.exercises.color}
                                    strokeWidth={2.5}
                                    dot={{ r: 3, fill: METRICS_CONFIG.exercises.color, strokeWidth: 0 }}
                                    activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                                    animationDuration={1200}
                                />
                                <Line
                                    yAxisId="tokens"
                                    type="monotone"
                                    dataKey="AI Tokens"
                                    stroke={METRICS_CONFIG.tokens.color}
                                    strokeWidth={2.5}
                                    dot={{ r: 3, fill: METRICS_CONFIG.tokens.color, strokeWidth: 0 }}
                                    activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                                    animationDuration={1200}
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>
            </section>

            {/* ═══════════════ Section C: Deep Dive ═══════════════ */}
            <section>
                <div className="w-full flex items-center justify-between py-4 px-1">
                    <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <Table2 className="w-4 h-4" />
                        Deep Dive
                    </h3>
                </div>

                <div className="space-y-6 pb-4">
                                {/* Tab switcher */}
                                <div className="flex bg-zinc-100/80 p-1 rounded-xl w-fit">
                                    <button
                                        onClick={() => setDeepDiveTab('chart')}
                                        className={cn(
                                            "px-4 py-2 text-xs font-semibold rounded-lg transition-all duration-200 flex items-center gap-1.5",
                                            deepDiveTab === 'chart'
                                                ? "bg-white text-zinc-900 shadow-sm"
                                                : "text-zinc-500 hover:text-zinc-700"
                                        )}
                                    >
                                        <BarChart3 className="w-3.5 h-3.5" />
                                        Charts
                                    </button>
                                    <button
                                        onClick={() => setDeepDiveTab('table')}
                                        className={cn(
                                            "px-4 py-2 text-xs font-semibold rounded-lg transition-all duration-200 flex items-center gap-1.5",
                                            deepDiveTab === 'table'
                                                ? "bg-white text-zinc-900 shadow-sm"
                                                : "text-zinc-500 hover:text-zinc-700"
                                        )}
                                    >
                                        <Table2 className="w-3.5 h-3.5" />
                                        Daily Detail
                                    </button>
                                </div>

                                {/* Chart sub-view */}
                                {deepDiveTab === 'chart' && (
                                    <div className="space-y-4">
                                        {/* Metric selector pills */}
                                        <div className="flex flex-wrap items-center gap-2">
                                            {METRIC_KEYS.map((key) => {
                                                const config = METRICS_CONFIG[key];
                                                const Icon = config.icon;
                                                return (
                                                    <button
                                                        key={key}
                                                        onClick={() => setSelectedChartMetric(key)}
                                                        className={cn(
                                                            "px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 border flex items-center gap-1.5",
                                                            selectedChartMetric === key
                                                                ? "text-white border-transparent shadow-md"
                                                                : "bg-white/80 text-zinc-500 border-zinc-200/60 hover:text-zinc-800 hover:border-zinc-300 backdrop-blur-md shadow-sm"
                                                        )}
                                                        style={selectedChartMetric === key ? { backgroundColor: config.color } : {}}
                                                    >
                                                        <Icon className="w-3.5 h-3.5" />
                                                        {config.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <div className="h-[350px]">
                                            <PeriodicBarChart
                                                records={records}
                                                title={METRICS_CONFIG[selectedChartMetric].chartTitle}
                                                metricLabel={METRICS_CONFIG[selectedChartMetric].metricLabel}
                                                icon={METRICS_CONFIG[selectedChartMetric].icon}
                                                extractValue={METRICS_CONFIG[selectedChartMetric].extractValue}
                                                color={METRICS_CONFIG[selectedChartMetric].color}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Table sub-view */}
                                {deepDiveTab === 'table' && (
                                    <div
                                        className="bg-white/80 backdrop-blur-md rounded-2xl border border-zinc-200/60 shadow-[0_4px_20px_rgb(0,0,0,0.03)] overflow-hidden"
                                    >
                                        {/* Week navigator */}
                                        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
                                            <button
                                                onClick={() => setTableWeekOffset(Math.min(tableWeekOffset + 1, 11))}
                                                className="text-xs font-medium text-zinc-400 hover:text-zinc-700 transition-colors px-3 py-1.5 rounded-lg hover:bg-zinc-100"
                                            >
                                                ← Prev
                                            </button>
                                            <span className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
                                                <CalendarDays className="w-4 h-4 text-zinc-400" />
                                                {tableWeekLabel}
                                            </span>
                                            <button
                                                onClick={() => setTableWeekOffset(Math.max(tableWeekOffset - 1, 0))}
                                                disabled={tableWeekOffset === 0}
                                                className={cn(
                                                    "text-xs font-medium transition-colors px-3 py-1.5 rounded-lg",
                                                    tableWeekOffset === 0
                                                        ? "text-zinc-200 cursor-not-allowed"
                                                        : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
                                                )}
                                            >
                                                Next →
                                            </button>
                                        </div>
                                        <WeeklyDetailTable records={records} weekOffset={tableWeekOffset} />
                                    </div>
                                )}
                            </div>
            </section>
        </div>
    );
}

'use client';

import { useState, useMemo } from 'react';
import {
    LineChart, Line, ComposedChart, XAxis, YAxis,
    CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart, Bar, BarChart
} from 'recharts';
import { format, startOfWeek, endOfWeek, subWeeks, subDays, isWithinInterval } from 'date-fns';
import { DailyRecord } from '@/lib/db';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, Timer, CheckCircle2, Cigarette, Dumbbell, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import PeriodicBarChart from './PeriodicBarChart';

type MetricType = 'Calories' | 'Exercises' | 'Focus' | 'Tasks';

interface DashboardAnalyticsProps {
    records: DailyRecord[];
}

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

function formatMinutes(mins: number): string {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function ChangeIndicator({ change, invertColor = false }: { change: ReturnType<typeof pctChange>; invertColor?: boolean }) {
    const isGood = invertColor ? change.direction === 'down' : change.direction === 'up';
    const isBad = invertColor ? change.direction === 'up' : change.direction === 'down';

    return (
        <span className={cn(
            "inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full",
            isGood && "text-emerald-700 bg-emerald-50",
            isBad && "text-red-600 bg-red-50",
            change.direction === 'neutral' && "text-zinc-500 bg-zinc-100"
        )}>
            {change.direction === 'up' && <TrendingUp className="w-3 h-3" />}
            {change.direction === 'down' && <TrendingDown className="w-3 h-3" />}
            {change.direction === 'neutral' && <Minus className="w-3 h-3" />}
            {change.label}
        </span>
    );
}

export default function DashboardAnalytics({ records }: DashboardAnalyticsProps) {
    const [selectedMetric, setSelectedMetric] = useState<MetricType>('Calories');

    const { todayData, yesterdayData, thisWeekData, lastWeekData } = useMemo(() => {
        const sorted = [...records].sort((a, b) =>
            new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        // Find today and yesterday
        const today = new Date();
        const todayStr = format(today, 'yyyy-MM-dd');
        const yesterdayStr = format(subDays(today, 1), 'yyyy-MM-dd');

        const todayRec = sorted.find(r => r.date.startsWith(todayStr));
        const yesterdayRec = sorted.find(r => r.date.startsWith(yesterdayStr));

        const todayData = {
            focus: todayRec?.focus_minutes ?? 0,
            tasks: todayRec?.tasks_completed ?? 0,
            exercises: todayRec?.exercises ?? 0,
            cigarettes: todayRec?.cigarettes ?? 0,
            balance: todayRec?.pushup_balance ?? 0,
            calories: todayRec?.calories_burned ?? 0,
        };

        const yesterdayData = {
            focus: yesterdayRec?.focus_minutes ?? 0,
            tasks: yesterdayRec?.tasks_completed ?? 0,
            exercises: yesterdayRec?.exercises ?? 0,
            cigarettes: yesterdayRec?.cigarettes ?? 0,
            balance: yesterdayRec?.pushup_balance ?? 0,
            calories: yesterdayRec?.calories_burned ?? 0,
        };

        // Weekly aggregation
        const thisWeekStart = startOfWeek(today, { weekStartsOn: 1 });
        const thisWeekEnd = endOfWeek(today, { weekStartsOn: 1 });
        const lastWeekStart = startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });
        const lastWeekEnd = endOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });

        const thisWeekRecords = sorted.filter(r => {
            const d = new Date(r.date);
            return isWithinInterval(d, { start: thisWeekStart, end: thisWeekEnd });
        });
        const lastWeekRecords = sorted.filter(r => {
            const d = new Date(r.date);
            return isWithinInterval(d, { start: lastWeekStart, end: lastWeekEnd });
        });

        const aggregate = (recs: DailyRecord[]) => ({
            focus: recs.reduce((s, r) => s + r.focus_minutes, 0),
            tasks: recs.reduce((s, r) => s + r.tasks_completed, 0),
            exercises: recs.reduce((s, r) => s + r.exercises, 0),
            cigarettes: recs.reduce((s, r) => s + r.cigarettes, 0),
            calories: recs.reduce((s, r) => s + (r.calories_burned || 0), 0),
        });

        const thisWeekData = aggregate(thisWeekRecords);
        const lastWeekData = aggregate(lastWeekRecords);

        return { todayData, yesterdayData, thisWeekData, lastWeekData };
    }, [records]);

    if (!records || records.length === 0) return null;

    const tooltipStyle = {
        borderRadius: '12px',
        border: '1px solid #e4e4e7',
        boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
        background: '#fff',
        fontSize: '13px',
    };

    const dodMetrics = [
        { label: 'Focus', today: formatMinutes(todayData.focus), yesterday: formatMinutes(yesterdayData.focus), change: pctChange(todayData.focus, yesterdayData.focus), invertColor: false, icon: <Timer className="w-4 h-4" /> },
        { label: 'Tasks', today: todayData.tasks, yesterday: yesterdayData.tasks, change: pctChange(todayData.tasks, yesterdayData.tasks), invertColor: false, icon: <CheckCircle2 className="w-4 h-4" /> },
        { label: 'Exercises', today: todayData.exercises, yesterday: yesterdayData.exercises, change: pctChange(todayData.exercises, yesterdayData.exercises), invertColor: false, icon: <Dumbbell className="w-4 h-4" /> },
        { label: 'Calories', today: todayData.calories, yesterday: yesterdayData.calories, change: pctChange(todayData.calories, yesterdayData.calories), invertColor: false, icon: <Flame className="w-4 h-4" /> },
        { label: 'Cigarettes', today: todayData.cigarettes, yesterday: yesterdayData.cigarettes, change: pctChange(todayData.cigarettes, yesterdayData.cigarettes), invertColor: true, icon: <Cigarette className="w-4 h-4" /> },
    ];

    const wowMetrics = [
        { label: 'Focus', thisWeek: formatMinutes(thisWeekData.focus), lastWeek: formatMinutes(lastWeekData.focus), change: pctChange(thisWeekData.focus, lastWeekData.focus), invertColor: false, icon: <Timer className="w-4 h-4" /> },
        { label: 'Tasks', thisWeek: thisWeekData.tasks, lastWeek: lastWeekData.tasks, change: pctChange(thisWeekData.tasks, lastWeekData.tasks), invertColor: false, icon: <CheckCircle2 className="w-4 h-4" /> },
        { label: 'Exercises', thisWeek: thisWeekData.exercises, lastWeek: lastWeekData.exercises, change: pctChange(thisWeekData.exercises, lastWeekData.exercises), invertColor: false, icon: <Dumbbell className="w-4 h-4" /> },
        { label: 'Calories', thisWeek: thisWeekData.calories, lastWeek: lastWeekData.calories, change: pctChange(thisWeekData.calories, lastWeekData.calories), invertColor: false, icon: <Flame className="w-4 h-4" /> },
        { label: 'Cigarettes', thisWeek: thisWeekData.cigarettes, lastWeek: lastWeekData.cigarettes, change: pctChange(thisWeekData.cigarettes, lastWeekData.cigarettes), invertColor: true, icon: <Cigarette className="w-4 h-4" /> },
    ];

    return (
        <div className="w-full space-y-10">
            {/* Section A: Daily Summary (DoD) */}
            <section>
                <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest mb-4">Today vs Yesterday</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {dodMetrics.map((m, i) => (
                        <motion.div
                            key={m.label}
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="p-5 rounded-2xl bg-white/80 backdrop-blur-md border border-zinc-200/60 shadow-[0_4px_20px_rgb(0,0,0,0.03)]"
                        >
                            <div className="flex items-center gap-2 mb-3 text-zinc-400">
                                {m.icon}
                                <span className="text-xs font-semibold uppercase tracking-widest">{m.label}</span>
                            </div>
                            <div className="text-2xl font-semibold text-zinc-900 mb-1">{m.today}</div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-zinc-400">vs {m.yesterday}</span>
                                <ChangeIndicator change={m.change} invertColor={m.invertColor ?? false} />
                            </div>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* Section B: Weekly Summary (WoW) */}
            <section>
                <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest mb-4">This Week vs Last Week</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {wowMetrics.map((m, i) => (
                        <motion.div
                            key={m.label}
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="p-5 rounded-2xl bg-white/80 backdrop-blur-md border border-zinc-200/60 shadow-[0_4px_20px_rgb(0,0,0,0.03)]"
                        >
                            <div className="flex items-center gap-2 mb-3 text-zinc-400">
                                {m.icon}
                                <span className="text-xs font-semibold uppercase tracking-widest">{m.label}</span>
                            </div>
                            <div className="text-2xl font-semibold text-zinc-900 mb-1">{m.thisWeek}</div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-zinc-400">vs {m.lastWeek}</span>
                                <ChangeIndicator change={m.change} invertColor={m.invertColor ?? false} />
                            </div>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* Section C: Charts */}
            <section>
                <div className="grid grid-cols-1 gap-6">
                    {/* Metric Selector & Single Chart */}
                    <div className="space-y-6">
                        <div className="flex flex-wrap items-center gap-2">
                            {(['Calories', 'Exercises', 'Focus', 'Tasks'] as MetricType[]).map((metric) => (
                                <button
                                    key={metric}
                                    onClick={() => setSelectedMetric(metric)}
                                    className={cn(
                                        "px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 border",
                                        selectedMetric === metric
                                            ? "bg-zinc-900 text-white border-zinc-900 shadow-md"
                                            : "bg-white/80 text-zinc-500 border-zinc-200/60 hover:text-zinc-800 hover:border-zinc-300 backdrop-blur-md shadow-sm"
                                    )}
                                >
                                    {metric}
                                </button>
                            ))}
                        </div>

                        <div className="h-[350px]">
                            {selectedMetric === 'Calories' && (
                                <PeriodicBarChart
                                    records={records}
                                    title="Calories Burned"
                                    metricLabel="kcal"
                                    icon={Flame}
                                    extractValue={(r) => r.calories_burned || 0}
                                    color="#ea580c"
                                />
                            )}
                            {selectedMetric === 'Exercises' && (
                                <PeriodicBarChart
                                    records={records}
                                    title="Exercises Logged"
                                    metricLabel="sets"
                                    icon={Dumbbell}
                                    extractValue={(r) => r.exercises}
                                    color="#0ea5e9"
                                />
                            )}
                            {selectedMetric === 'Focus' && (
                                <PeriodicBarChart
                                    records={records}
                                    title="Focus Time"
                                    metricLabel="min"
                                    icon={Timer}
                                    extractValue={(r) => r.focus_minutes}
                                    color="#8b5cf6"
                                />
                            )}
                            {selectedMetric === 'Tasks' && (
                                <PeriodicBarChart
                                    records={records}
                                    title="Tasks Completed"
                                    metricLabel="tasks"
                                    icon={CheckCircle2}
                                    extractValue={(r) => r.tasks_completed}
                                    color="#22c55e"
                                />
                            )}
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}

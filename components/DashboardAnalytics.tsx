'use client';

import { useState, useMemo } from 'react';
import {
    LineChart, Line, ComposedChart, XAxis, YAxis,
    CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart, Bar, BarChart
} from 'recharts';
import { format, startOfWeek, endOfWeek, subWeeks, subDays, isWithinInterval, parseISO } from 'date-fns';
import { DailyRecord } from '@/lib/db';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, Activity, Timer, CheckCircle2, Cigarette, Dumbbell } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DashboardAnalyticsProps {
    records: DailyRecord[];
}

type TimeRange = 7 | 30 | 90;

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
    const [timeRange, setTimeRange] = useState<TimeRange>(30);

    const { todayData, yesterdayData, thisWeekData, lastWeekData, chartData, weeklyBarData } = useMemo(() => {
        const sorted = [...records].sort((a, b) =>
            new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        // Find today and yesterday
        const today = new Date();
        const todayStr = format(today, 'yyyy-MM-dd');
        const yesterdayStr = format(subDays(today, 1), 'yyyy-MM-dd');

        const todayRec = sorted.find(r => r.date === todayStr);
        const yesterdayRec = sorted.find(r => r.date === yesterdayStr);

        const todayData = {
            focus: todayRec?.focus_minutes ?? 0,
            tasks: todayRec?.tasks_completed ?? 0,
            exercises: todayRec?.exercises ?? 0,
            cigarettes: todayRec?.cigarettes ?? 0,
            balance: todayRec?.pushup_balance ?? 0,
        };

        const yesterdayData = {
            focus: yesterdayRec?.focus_minutes ?? 0,
            tasks: yesterdayRec?.tasks_completed ?? 0,
            exercises: yesterdayRec?.exercises ?? 0,
            cigarettes: yesterdayRec?.cigarettes ?? 0,
            balance: yesterdayRec?.pushup_balance ?? 0,
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
        });

        const thisWeekData = aggregate(thisWeekRecords);
        const lastWeekData = aggregate(lastWeekRecords);

        // Chart data
        const rangeRecords = sorted.slice(-timeRange);
        const chartData = rangeRecords.map((record) => ({
            date: format(new Date(record.date), 'MM/dd'),
            balance: record.pushup_balance,
            focus: record.focus_minutes,
            tasks: record.tasks_completed,
        }));

        // Weekly bar comparison data
        const metrics = ['Focus (min)', 'Tasks', 'Exercises', 'Cigarettes'] as const;
        const thisWeekVals = [thisWeekData.focus, thisWeekData.tasks, thisWeekData.exercises, thisWeekData.cigarettes];
        const lastWeekVals = [lastWeekData.focus, lastWeekData.tasks, lastWeekData.exercises, lastWeekData.cigarettes];

        const weeklyBarData = metrics.map((name, i) => ({
            name,
            'This Week': thisWeekVals[i],
            'Last Week': lastWeekVals[i],
        }));

        return { todayData, yesterdayData, thisWeekData, lastWeekData, chartData, weeklyBarData };
    }, [records, timeRange]);

    if (!records || records.length === 0) return null;

    const tooltipStyle = {
        borderRadius: '12px',
        border: '1px solid #e4e4e7',
        boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
        background: '#fff',
        fontSize: '13px',
    };

    const dodMetrics = [
        { label: 'Focus', today: formatMinutes(todayData.focus), yesterday: formatMinutes(yesterdayData.focus), change: pctChange(todayData.focus, yesterdayData.focus), icon: <Timer className="w-4 h-4" /> },
        { label: 'Tasks', today: todayData.tasks, yesterday: yesterdayData.tasks, change: pctChange(todayData.tasks, yesterdayData.tasks), icon: <CheckCircle2 className="w-4 h-4" /> },
        { label: 'Exercises', today: todayData.exercises, yesterday: yesterdayData.exercises, change: pctChange(todayData.exercises, yesterdayData.exercises), icon: <Dumbbell className="w-4 h-4" /> },
        { label: 'Cigarettes', today: todayData.cigarettes, yesterday: yesterdayData.cigarettes, change: pctChange(todayData.cigarettes, yesterdayData.cigarettes), invertColor: true, icon: <Cigarette className="w-4 h-4" /> },
    ];

    const wowMetrics = [
        { label: 'Focus', thisWeek: formatMinutes(thisWeekData.focus), lastWeek: formatMinutes(lastWeekData.focus), change: pctChange(thisWeekData.focus, lastWeekData.focus), icon: <Timer className="w-4 h-4" /> },
        { label: 'Tasks', thisWeek: thisWeekData.tasks, lastWeek: lastWeekData.tasks, change: pctChange(thisWeekData.tasks, lastWeekData.tasks), icon: <CheckCircle2 className="w-4 h-4" /> },
        { label: 'Exercises', thisWeek: thisWeekData.exercises, lastWeek: lastWeekData.exercises, change: pctChange(thisWeekData.exercises, lastWeekData.exercises), icon: <Dumbbell className="w-4 h-4" /> },
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
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Trends</h3>
                    <div className="flex bg-zinc-100 p-1 rounded-xl">
                        {([7, 30, 90] as const).map((range) => (
                            <button
                                key={range}
                                onClick={() => setTimeRange(range)}
                                className={cn(
                                    "px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200",
                                    timeRange === range
                                        ? "bg-white text-zinc-900 shadow-sm"
                                        : "text-zinc-500 hover:text-zinc-700"
                                )}
                            >
                                {range}D
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Daily Focus & Tasks Trend */}
                    <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-zinc-200/60 shadow-[0_4px_20px_rgb(0,0,0,0.03)]"
                    >
                        <h4 className="text-sm font-semibold text-zinc-700 mb-5 uppercase tracking-wider">Focus & Tasks</h4>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="focusGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#71717a" stopOpacity={0.15} />
                                            <stop offset="95%" stopColor="#71717a" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#a1a1aa', fontSize: 11 }} dy={8} />
                                    <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#a1a1aa', fontSize: 11 }} />
                                    <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#a1a1aa', fontSize: 11 }} />
                                    <Tooltip contentStyle={tooltipStyle} />
                                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', color: '#71717a' }} />
                                    <Area yAxisId="left" type="monotone" dataKey="focus" name="Focus (min)" fill="url(#focusGrad)" stroke="#71717a" strokeWidth={2} />
                                    <Bar yAxisId="right" dataKey="tasks" name="Tasks" barSize={10} fill="#27272a" radius={[3, 3, 0, 0]} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </motion.div>

                    {/* Balance History */}
                    <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 }}
                        className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-zinc-200/60 shadow-[0_4px_20px_rgb(0,0,0,0.03)]"
                    >
                        <h4 className="text-sm font-semibold text-zinc-700 mb-5 uppercase tracking-wider">Balance History</h4>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#a1a1aa', fontSize: 11 }} dy={8} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#a1a1aa', fontSize: 11 }} />
                                    <Tooltip contentStyle={tooltipStyle} />
                                    <Line type="monotone" dataKey="balance" name="Balance" stroke="#18181b" strokeWidth={2.5} dot={{ fill: '#18181b', r: 3, strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 0, fill: '#18181b' }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </motion.div>

                    {/* Weekly Comparison Bar Chart */}
                    <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="lg:col-span-2 bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-zinc-200/60 shadow-[0_4px_20px_rgb(0,0,0,0.03)]"
                    >
                        <h4 className="text-sm font-semibold text-zinc-700 mb-5 uppercase tracking-wider">Week-over-Week Comparison</h4>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={weeklyBarData} margin={{ top: 5, right: 20, left: -10, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#a1a1aa', fontSize: 11 }} dy={8} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#a1a1aa', fontSize: 11 }} />
                                    <Tooltip contentStyle={tooltipStyle} />
                                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', color: '#71717a' }} />
                                    <Bar dataKey="This Week" fill="#18181b" radius={[4, 4, 0, 0]} barSize={20} />
                                    <Bar dataKey="Last Week" fill="#d4d4d8" radius={[4, 4, 0, 0]} barSize={20} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </motion.div>
                </div>
            </section>
        </div>
    );
}

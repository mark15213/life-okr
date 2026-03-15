'use client';

import { useMemo, useState } from 'react';
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { format, subDays, subWeeks, subMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { DailyRecord } from '@/lib/db';
import { motion, AnimatePresence } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TimePeriod = 'Day' | 'Week' | 'Month';

interface PeriodicBarChartProps {
    records: DailyRecord[];
    title: string;
    metricLabel: string;
    icon: LucideIcon;
    extractValue: (record: DailyRecord) => number;
    color?: string; // Hex color for the bars
}

export default function PeriodicBarChart({
    records,
    title,
    metricLabel,
    icon: Icon,
    extractValue,
    color = '#18181b' // Default to zinc-900
}: PeriodicBarChartProps) {
    const [period, setPeriod] = useState<TimePeriod>('Day');

    const chartData = useMemo(() => {
        if (!records || records.length === 0) return [];

        const sorted = [...records].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const data = [];

        if (period === 'Day') {
            // Last 14 days
            for (let i = 13; i >= 0; i--) {
                const d = subDays(today, i);
                const dateStr = format(d, 'yyyy-MM-dd');
                const record = sorted.find(r => r.date.startsWith(dateStr));
                data.push({
                    label: format(d, 'MM/dd'),
                    value: record ? extractValue(record) : 0,
                });
            }
        } else if (period === 'Week') {
            // Last 12 weeks
            for (let i = 11; i >= 0; i--) {
                const d = subWeeks(today, i);
                const weekStart = startOfWeek(d, { weekStartsOn: 0 });
                const weekEnd = endOfWeek(d, { weekStartsOn: 0 });

                const weekRecords = sorted.filter(r => {
                    const rd = parseISO(r.date);
                    return isWithinInterval(rd, { start: weekStart, end: weekEnd });
                });

                const total = weekRecords.reduce((sum, r) => sum + extractValue(r), 0);
                data.push({
                    label: `W${format(weekStart, 'ww')}`,
                    fullLabel: `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d')}`,
                    value: total
                });
            }
        } else if (period === 'Month') {
            // Last 12 months
            for (let i = 11; i >= 0; i--) {
                const d = subMonths(today, i);
                const monthStart = startOfMonth(d);
                const monthEnd = endOfMonth(d);

                const monthRecords = sorted.filter(r => {
                    const rd = parseISO(r.date);
                    return isWithinInterval(rd, { start: monthStart, end: monthEnd });
                });

                const total = monthRecords.reduce((sum, r) => sum + extractValue(r), 0);
                data.push({
                    label: format(monthStart, 'MMM'),
                    fullLabel: format(monthStart, 'MMMM yyyy'),
                    value: total
                });
            }
        }

        return data;
    }, [records, period, extractValue]);

    const tooltipStyle = {
        borderRadius: '12px',
        border: '1px solid #e4e4e7',
        boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
        background: '#fff',
        fontSize: '13px',
        padding: '8px 12px'
    };

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const dataPoint = payload[0].payload;
            return (
                <div style={tooltipStyle}>
                    <p className="text-zinc-500 mb-1 font-medium">{dataPoint.fullLabel || label}</p>
                    <p className="text-zinc-900 font-semibold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }}></span>
                        {payload[0].value} <span className="text-zinc-400 font-normal">{metricLabel}</span>
                    </p>
                </div>
            );
        }
        return null;
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-zinc-200/60 shadow-[0_4px_20px_rgb(0,0,0,0.03)] flex flex-col h-full"
        >
            <div className="flex items-center justify-between mb-6">
                <h4 className="text-sm font-semibold text-zinc-700 flex items-center gap-2 uppercase tracking-wider">
                    <Icon className="w-4 h-4 text-zinc-400" />
                    {title}
                </h4>

                <div className="flex bg-zinc-100/80 p-1 rounded-xl">
                    {(['Day', 'Week', 'Month'] as TimePeriod[]).map((p) => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={cn(
                                "px-3 py-1 text-xs font-semibold rounded-lg transition-all duration-200",
                                period === p
                                    ? "bg-white text-zinc-900 shadow-sm"
                                    : "text-zinc-500 hover:text-zinc-700"
                            )}
                        >
                            {p}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 min-h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
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
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f4f4f5' }} />
                        <Bar
                            dataKey="value"
                            fill={color}
                            radius={[4, 4, 0, 0]}
                            barSize={period === 'Month' ? 24 : period === 'Week' ? 20 : 16}
                            animationDuration={800}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </motion.div>
    );
}

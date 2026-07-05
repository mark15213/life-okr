'use client';

import { motion } from 'framer-motion';
import { Timer } from 'lucide-react';

interface FocusCardProps {
  todayMinutes: number;
  weeklyAverage: number;
  monthlyAverage: number;
}

export default function FocusCard({
  todayMinutes,
  weeklyAverage,
  monthlyAverage,
}: FocusCardProps) {
  const formatTime = (mins: number) => {
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}:${remainingMins.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      whileHover={{ y: -3, boxShadow: '0 18px 40px -18px rgba(15, 23, 42, 0.22)' }}
      className="relative flex min-h-[390px] flex-col overflow-hidden rounded-lg border border-zinc-200/80 bg-white/85 p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)] backdrop-blur-md transition-all duration-300"
    >
      <div className="mb-7 flex items-start justify-between">
        <h2 className="flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-violet-100 bg-violet-50">
            <Timer className="h-4 w-4 text-violet-500" />
          </span>
          Focus Time
        </h2>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <motion.div
          key={todayMinutes}
          initial={{ scale: 1.1, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-5xl font-light tracking-tight text-zinc-900 tabular-nums sm:text-6xl"
        >
          {formatTime(todayMinutes)}
        </motion.div>

        <div className="mt-2 text-sm font-medium text-zinc-400">Today&apos;s Focus</div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-zinc-100 pt-4">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Week Avg</div>
          <div className="text-lg font-semibold text-zinc-900 tabular-nums">{formatTime(weeklyAverage)}</div>
        </div>
        <div className="text-right">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Month Avg</div>
          <div className="text-lg font-semibold text-zinc-900 tabular-nums">{formatTime(monthlyAverage)}</div>
        </div>
      </div>
    </motion.div>
  );
}

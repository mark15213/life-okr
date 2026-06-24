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
      whileHover={{ y: -5, boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.05)" }}
      className="relative min-h-[520px] rounded-[2rem] p-7 sm:p-8 xl:p-9 bg-white/90 backdrop-blur-xl border border-zinc-200/70 shadow-[0_18px_55px_rgba(15,23,42,0.07)] transition-all duration-500 overflow-hidden flex flex-col justify-between"
    >
      {/* Top Header Area */}
      <div className="flex justify-between items-start mb-10">
        <h2 className="text-zinc-500 text-sm font-semibold uppercase tracking-widest flex items-center gap-2 leading-none">
          <Timer className="w-4 h-4 text-zinc-400" />
          Focus Time
        </h2>
      </div>

      {/* Main Focus Time Display */}
      <div className="text-center mb-10 flex-1 flex flex-col justify-center">
        <motion.div
          key={todayMinutes}
          initial={{ scale: 1.1, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-6xl sm:text-7xl font-light text-zinc-900 tracking-tight tabular-nums"
        >
          {formatTime(todayMinutes)}
        </motion.div>

        <div className="mt-2 text-sm text-zinc-400 font-medium">Today&apos;s Focus</div>
      </div>

      {/* Statistics Footer */}
      <div className="pt-5 border-t border-zinc-100 flex justify-between items-center text-zinc-500">
        <div className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Averages</div>
        <div className="flex gap-6 text-sm">
          <div className="flex flex-col items-end">
            <span className="font-medium text-zinc-700">{formatTime(weeklyAverage)}</span>
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Week</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="font-medium text-zinc-700">{formatTime(monthlyAverage)}</span>
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Month</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

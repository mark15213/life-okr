'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Timer, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FocusCardProps {
  todayMinutes: number;
  weeklyAverage: number;
  monthlyAverage: number;
  onAddFocus: (minutes: number) => Promise<void>;
}

export default function FocusCard({
  todayMinutes,
  weeklyAverage,
  monthlyAverage,
  onAddFocus,
}: FocusCardProps) {
  const [minutes, setMinutes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseInt(minutes);
    if (value > 0) {
      setLoading(true);
      await onAddFocus(value);
      setMinutes('');
      setLoading(false);
    }
  };

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
      className="relative rounded-3xl p-8 bg-white/80 backdrop-blur-xl border border-zinc-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-500 overflow-hidden flex flex-col justify-between"
    >
      {/* Top Header Area */}
      <div className="flex justify-between items-start mb-8">
        <h2 className="text-zinc-500 text-sm font-semibold uppercase tracking-widest flex items-center gap-2">
          <Timer className="w-4 h-4 text-zinc-400" />
          Focus Time
        </h2>
      </div>

      {/* Main Focus Time Display */}
      <div className="text-center mb-8 flex-1 flex flex-col justify-center">
        <motion.div
          key={todayMinutes}
          initial={{ scale: 1.1, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-7xl font-light text-zinc-900 tracking-tight"
        >
          {formatTime(todayMinutes)}
        </motion.div>

        <div className="mt-2 text-sm text-zinc-400 font-medium">Today's Focus</div>
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex gap-2 relative">
          <input
            type="number"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="Add minutes..."
            min="1"
            className="flex-1 bg-zinc-50 border border-zinc-200 text-zinc-800 placeholder-zinc-400 px-4 py-3 rounded-2xl font-medium focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-300 transition-all"
            disabled={loading}
          />
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={loading || !minutes}
            className="bg-zinc-900 hover:bg-zinc-800 text-white px-5 py-3 rounded-2xl shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            <Plus className="w-5 h-5" />
          </motion.button>
        </div>
      </form>

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
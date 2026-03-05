'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getProgressToNextLevel } from '@/lib/wealth-levels';
import { Cigarette, Dumbbell, Wallet, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PushupCardProps {
  balance: number;
  cigarettes: number;
  exercises: number;
  onCigarette: () => Promise<void>;
  onExercise: () => Promise<void>;
}

export default function PushupCard({
  balance,
  cigarettes,
  exercises,
  onCigarette,
  onExercise,
}: PushupCardProps) {
  const [loading, setLoading] = useState(false);

  const handleCigarette = async () => {
    setLoading(true);
    await onCigarette();
    setLoading(false);
  };

  const handleExercise = async () => {
    setLoading(true);
    await onExercise();
    setLoading(false);
  };

  const { current, next, progress, remaining } = getProgressToNextLevel(balance);
  const redeemableAmount = balance < 0 ? Math.abs(balance) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      whileHover={{ y: -5, boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.05)" }}
      className="relative rounded-3xl p-8 bg-white/80 backdrop-blur-xl border border-zinc-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-500 overflow-hidden flex flex-col justify-between"
    >
      {/* Top Header Area */}
      <div className="flex justify-between items-start mb-8">
        <h2 className="text-zinc-500 text-sm font-semibold uppercase tracking-widest flex items-center gap-2">
          <Wallet className="w-4 h-4 text-zinc-400" />
          Balance
        </h2>
        <div className="flex items-center gap-2 bg-zinc-100/80 px-3 py-1.5 rounded-full border border-zinc-200/50">
          <span className="text-lg">{current.emoji}</span>
          <span className="text-xs font-bold text-zinc-600">{current.name}</span>
        </div>
      </div>

      {/* Main Balance Display */}
      <div className="text-center mb-8 flex-1 flex flex-col justify-center">
        <motion.div
          key={balance}
          initial={{ scale: 1.1, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-7xl font-light text-zinc-900 tracking-tight"
        >
          {balance}
        </motion.div>

        <div className="mt-2 h-8">
          <AnimatePresence>
            {redeemableAmount > 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-sm text-emerald-600 font-medium flex items-center justify-center gap-1.5"
              >
                <span>≈</span> ¥{redeemableAmount}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* Progress to Next Level (Minimalist) */}
      {next && (
        <div className="mb-8">
          <div className="flex justify-between items-end text-zinc-500 text-xs mb-2 font-medium">
            <span>Next: {next.name}</span>
            <span>{Math.abs(remaining)} left</span>
          </div>
          <div className="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="h-full rounded-full bg-zinc-800"
            />
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleCigarette}
          disabled={loading}
          className="flex flex-col items-center justify-center gap-1.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 font-medium py-3 px-4 rounded-2xl border border-zinc-200/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          <Cigarette className="w-5 h-5 text-zinc-400 group-hover:text-red-500 transition-colors" />
          <div className="flex items-center gap-1 text-sm">
            <span>Smoke</span>
            <span className="text-xs text-zinc-400">+100</span>
          </div>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleExercise}
          disabled={loading}
          className="flex flex-col items-center justify-center gap-1.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 font-medium py-3 px-4 rounded-2xl border border-zinc-200/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          <Dumbbell className="w-5 h-5 text-zinc-400 group-hover:text-emerald-500 transition-colors" />
          <div className="flex items-center gap-1 text-sm">
            <span>Workout</span>
            <span className="text-xs text-zinc-400">-100</span>
          </div>
        </motion.button>
      </div>

      {/* Today's Stats Footer */}
      <div className="pt-5 border-t border-zinc-100 flex justify-between items-center text-zinc-500">
        <div className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Today</div>
        <div className="flex gap-6 text-sm">
          <div className="flex items-center gap-1.5">
            <Cigarette className="w-3.5 h-3.5 opacity-60" />
            <span className="font-medium text-zinc-700">{cigarettes}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Dumbbell className="w-3.5 h-3.5 opacity-60" />
            <span className="font-medium text-zinc-700">{exercises}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

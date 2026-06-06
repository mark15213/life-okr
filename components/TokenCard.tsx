'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

interface TokenCardProps {
  todayTotal: number;
  todayClaude: number;
  todayCodex: number;
  weeklyAverage: number;
  monthlyAverage: number;
}

function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default function TokenCard({
  todayTotal,
  todayClaude,
  todayCodex,
  weeklyAverage,
  monthlyAverage,
}: TokenCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15 }}
      whileHover={{ y: -5, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.05)' }}
      className="relative min-h-[520px] rounded-[2rem] p-7 sm:p-8 xl:p-9 bg-white/90 backdrop-blur-xl border border-zinc-200/70 shadow-[0_18px_55px_rgba(15,23,42,0.07)] transition-all duration-500 overflow-hidden flex flex-col justify-between"
    >
      <div className="flex justify-between items-start mb-10">
        <h2 className="text-zinc-500 text-sm font-semibold uppercase tracking-widest flex items-center gap-2 leading-none">
          <Sparkles className="w-4 h-4 text-zinc-400" />
          AI Tokens
        </h2>
      </div>

      <div className="text-center mb-10 flex-1 flex flex-col justify-center">
        <motion.div
          key={todayTotal}
          initial={{ scale: 1.1, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-6xl sm:text-7xl font-light text-zinc-900 tracking-tight tabular-nums"
        >
          {formatTokens(todayTotal)}
        </motion.div>
        <div className="mt-2 text-sm text-zinc-400 font-medium">Today&apos;s Tokens</div>
        <div className="mt-3 text-xs text-zinc-500 font-medium leading-5">
          Claude {formatTokens(todayClaude)} · Codex {formatTokens(todayCodex)}
        </div>
      </div>

      <div className="pt-5 border-t border-zinc-100 flex justify-between items-center text-zinc-500">
        <div className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Averages</div>
        <div className="flex gap-6 text-sm">
          <div className="flex flex-col items-end">
            <span className="font-medium text-zinc-700">{formatTokens(weeklyAverage)}</span>
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Week</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="font-medium text-zinc-700">{formatTokens(monthlyAverage)}</span>
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Month</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

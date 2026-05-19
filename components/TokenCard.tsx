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
      className="relative rounded-3xl p-8 bg-white/80 backdrop-blur-xl border border-zinc-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-500 overflow-hidden flex flex-col justify-between"
    >
      <div className="flex justify-between items-start mb-8">
        <h2 className="text-zinc-500 text-sm font-semibold uppercase tracking-widest flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-zinc-400" />
          AI Tokens
        </h2>
      </div>

      <div className="text-center mb-8 flex-1 flex flex-col justify-center">
        <motion.div
          key={todayTotal}
          initial={{ scale: 1.1, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-7xl font-light text-zinc-900 tracking-tight"
        >
          {formatTokens(todayTotal)}
        </motion.div>
        <div className="mt-2 text-sm text-zinc-400 font-medium">Today's Tokens</div>
        <div className="mt-3 text-xs text-zinc-500 font-medium">
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

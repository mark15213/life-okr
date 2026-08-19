'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { formatTokens } from '@/lib/format';

interface TokenCardProps {
  todayTotal: number;
  todayClaude: number;
  todayCodex: number;
  weeklyAverage: number;
  monthlyAverage: number;
}

function formatOrDash(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  return formatTokens(n);
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
      whileHover={{ y: -3, boxShadow: '0 18px 40px -18px rgba(15, 23, 42, 0.22)' }}
      className="relative flex min-h-[390px] flex-col overflow-hidden rounded-lg border border-zinc-200/80 bg-white/85 p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)] backdrop-blur-md transition-all duration-300"
    >
      <div className="mb-7 flex items-start justify-between">
        <h2 className="flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-pink-100 bg-pink-50">
            <Sparkles className="h-4 w-4 text-pink-500" />
          </span>
          AI Tokens
        </h2>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <motion.div
          key={todayTotal}
          initial={{ scale: 1.1, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-5xl font-light tracking-tight text-zinc-900 tabular-nums sm:text-6xl"
        >
          {formatOrDash(todayTotal)}
        </motion.div>
        <div className="mt-2 text-sm font-medium text-zinc-400">Today&apos;s Tokens</div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-500">
            Claude {formatOrDash(todayClaude)}
          </span>
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-500">
            Codex {formatOrDash(todayCodex)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-zinc-100 pt-4">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Week Avg</div>
          <div className="text-lg font-semibold text-zinc-900 tabular-nums">{formatOrDash(weeklyAverage)}</div>
        </div>
        <div className="text-right">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Month Avg</div>
          <div className="text-lg font-semibold text-zinc-900 tabular-nums">{formatOrDash(monthlyAverage)}</div>
        </div>
      </div>
    </motion.div>
  );
}

'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Plus } from 'lucide-react';

interface TaskCardProps {
  todayTasks: number;
  weeklyTotal: number;
  monthlyTotal: number;
  onAddTask: () => Promise<void>;
  isAuthed: boolean;
}

export default function TaskCard({
  todayTasks,
  weeklyTotal,
  monthlyTotal,
  onAddTask,
  isAuthed,
}: TaskCardProps) {
  const [loading, setLoading] = useState(false);

  const handleAddTask = async () => {
    if (!isAuthed) return;
    setLoading(true);
    await onAddTask();
    setLoading(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      whileHover={{ y: -5, boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.05)" }}
      className="relative min-h-[520px] rounded-[2rem] p-7 sm:p-8 xl:p-9 bg-white/90 backdrop-blur-xl border border-zinc-200/70 shadow-[0_18px_55px_rgba(15,23,42,0.07)] transition-all duration-500 overflow-hidden flex flex-col justify-between"
    >
      {/* Top Header Area */}
      <div className="flex justify-between items-start mb-10">
        <h2 className="text-zinc-500 text-sm font-semibold uppercase tracking-widest flex items-center gap-2 leading-none">
          <CheckCircle2 className="w-4 h-4 text-zinc-400" />
          Tasks Completed
        </h2>
      </div>

      {/* Main Task Count Display */}
      <div className="text-center mb-10 flex-1 flex flex-col justify-center">
        <motion.div
          key={todayTasks}
          initial={{ scale: 1.1, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-6xl sm:text-7xl font-light text-zinc-900 tracking-tight tabular-nums"
        >
          {todayTasks}
        </motion.div>
        <div className="mt-2 text-sm text-zinc-400 font-medium">Today&apos;s Tasks</div>
      </div>

      {/* Add Task Button */}
      <div className="mb-8 h-[50px] flex items-center justify-center">
        <motion.button
          whileHover={isAuthed ? { scale: 1.02 } : {}}
          whileTap={isAuthed ? { scale: 0.98 } : {}}
          onClick={handleAddTask}
          disabled={loading || !isAuthed}
          className="w-full h-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white font-medium rounded-2xl shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          <Plus className="w-5 h-5 transition-transform group-hover:rotate-90" />
          <span className="whitespace-nowrap">Complete a Task</span>
        </motion.button>
      </div>

      {/* Statistics Footer */}
      <div className="pt-5 border-t border-zinc-100 flex justify-between items-center text-zinc-500">
        <div className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Totals</div>
        <div className="flex gap-6 text-sm">
          <div className="flex flex-col items-end">
            <span className="font-medium text-zinc-700">{weeklyTotal}</span>
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Week</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="font-medium text-zinc-700">{monthlyTotal}</span>
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Month</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

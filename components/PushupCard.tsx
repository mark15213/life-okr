'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cigarette, Dumbbell, Activity, AlertTriangle } from 'lucide-react';

interface PushupCardProps {
  balance: number;
  cigarettes: number;
  exercises: number;
  onCigarette: () => Promise<void>;
  onExercise: (calories: number) => Promise<void>;
  isAuthed: boolean;
}

export default function PushupCard({
  balance,
  cigarettes,
  exercises,
  onCigarette,
  onExercise,
  isAuthed,
}: PushupCardProps) {
  const [loading, setLoading] = useState(false);
  const [calories, setCalories] = useState<string>('');

  // Dynamic title: positive balance means smoking debt, negative means workout surplus
  const isDebt = balance > 0;
  const cardTitle = isDebt ? 'Smoking Debt' : 'Workout Surplus';
  const displayValue = Math.abs(balance);

  // If true, the user has clicked "Workout" and is being prompted for calories
  const [showCaloriesInput, setShowCaloriesInput] = useState(false);

  const actionButtonClass = isAuthed
    ? 'bg-white hover:bg-zinc-50 text-zinc-700 border-zinc-200/80 disabled:opacity-40 disabled:cursor-not-allowed'
    : 'bg-zinc-50 text-zinc-300 border-zinc-200 cursor-not-allowed shadow-none';
  const actionIconClass = isAuthed
    ? 'text-zinc-400 group-hover:text-zinc-700'
    : 'text-zinc-300';
  const actionDeltaClass = isAuthed ? 'text-zinc-400' : 'text-zinc-300';

  const handleCigarette = async () => {
    if (!isAuthed) return;
    setLoading(true);
    await onCigarette();
    setLoading(false);
  };

  const handleExerciseClick = () => {
    if (!isAuthed) return;
    setShowCaloriesInput(true);
  };

  const submitExercise = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isAuthed) return;

    setLoading(true);
    await onExercise(Number(calories) || 0);
    setCalories('');
    setShowCaloriesInput(false);
    setLoading(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      whileHover={{ y: -3, boxShadow: '0 18px 40px -18px rgba(15, 23, 42, 0.22)' }}
      className="relative flex min-h-[390px] flex-col overflow-hidden rounded-lg border border-zinc-200/80 bg-white/85 p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)] backdrop-blur-md transition-all duration-300"
    >
      <div className="mb-7 flex items-start justify-between">
        <h2 className="flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50">
          {isDebt ? (
              <AlertTriangle className="h-4 w-4 text-rose-500" />
          ) : (
              <Activity className="h-4 w-4 text-emerald-500" />
          )}
          </span>
          {cardTitle}
        </h2>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <motion.div
          key={balance}
          initial={{ scale: 1.1, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-5xl font-light tracking-tight text-zinc-900 tabular-nums sm:text-6xl"
        >
          {displayValue}
        </motion.div>
        <div className="mt-2 text-sm font-medium text-zinc-400">
          {isDebt ? 'Pushups Owed' : balance === 0 ? 'Balanced' : 'Extra Pushups'}
        </div>
      </div>

      <div className="relative mb-5 grid grid-cols-2 gap-2">
        <motion.button
          whileHover={isAuthed ? { scale: 1.02 } : {}}
          whileTap={isAuthed ? { scale: 0.98 } : {}}
          onClick={handleCigarette}
          disabled={loading || !isAuthed || showCaloriesInput}
          className={`group flex h-14 items-center justify-center gap-2 rounded-lg border px-3 py-3 font-medium transition-all ${actionButtonClass}`}
        >
          <Cigarette className={`w-5 h-5 transition-colors ${actionIconClass}`} />
          <div className="flex items-center gap-1 text-sm">
            <span>Smoke</span>
            <span className={`text-xs ${actionDeltaClass}`}>+100</span>
          </div>
        </motion.button>

        <div className="relative h-14">
          <AnimatePresence mode="wait">
            {!showCaloriesInput ? (
              <motion.button
                key="btn"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                whileHover={isAuthed ? { scale: 1.02 } : {}}
                whileTap={isAuthed ? { scale: 0.98 } : {}}
                onClick={handleExerciseClick}
                disabled={loading || !isAuthed}
                className={`absolute inset-0 flex h-full w-full items-center justify-center gap-2 rounded-lg border px-3 py-3 font-medium transition-all group ${actionButtonClass}`}
              >
                <Dumbbell className={`w-5 h-5 transition-colors ${actionIconClass}`} />
                <div className="flex items-center gap-1 text-sm">
                  <span>Workout</span>
                  <span className={`text-xs ${actionDeltaClass}`}>-100</span>
                </div>
              </motion.button>
            ) : (
              <motion.form
                key="input"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                onSubmit={submitExercise}
                className="absolute inset-0 flex h-full w-full flex-col gap-1 rounded-lg border border-zinc-200 bg-white p-1.5 shadow-sm"
              >
                <input
                  type="number"
                  autoFocus
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  placeholder="Calories?"
                  min="0"
                  disabled={loading}
                  className="w-full flex-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 text-center text-xs font-medium text-zinc-800 placeholder-zinc-400 transition-all focus:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-900/10"
                />
                <div className="flex h-5 gap-1">
                  <button
                    type="button"
                    onClick={() => setShowCaloriesInput(false)}
                    disabled={loading}
                    className="flex-1 rounded-md bg-zinc-100 text-[10px] font-bold uppercase tracking-wider text-zinc-600 transition-colors hover:bg-zinc-200 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 rounded-md bg-zinc-900 text-[10px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-zinc-100 pt-4">
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
            <Cigarette className="h-3.5 w-3.5" />
            Smoke
          </div>
          <div className="text-lg font-semibold text-zinc-900 tabular-nums">{cigarettes}</div>
        </div>
        <div className="text-right">
          <div className="mb-1 flex items-center justify-end gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
            <Dumbbell className="h-3.5 w-3.5" />
            Workout
          </div>
          <div className="text-lg font-semibold text-zinc-900 tabular-nums">{exercises}</div>
        </div>
      </div>
    </motion.div>
  );
}

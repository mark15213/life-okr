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
      whileHover={{ y: -5, boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.05)" }}
      className="relative rounded-3xl p-8 bg-white/80 backdrop-blur-xl border border-zinc-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-500 overflow-hidden flex flex-col justify-between"
    >
      {/* Top Header Area */}
      <div className="flex justify-between items-start mb-8">
        <h2 className="text-zinc-500 text-sm font-semibold uppercase tracking-widest flex items-center gap-2">
          {isDebt ? (
            <AlertTriangle className="w-4 h-4 text-zinc-400" />
          ) : (
            <Activity className="w-4 h-4 text-zinc-400" />
          )}
          {cardTitle}
        </h2>
      </div>

      {/* Main Display */}
      <div className="text-center mb-8 flex-1 flex flex-col justify-center">
        <motion.div
          key={balance}
          initial={{ scale: 1.1, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-7xl font-light tracking-tight text-zinc-900"
        >
          {displayValue}
        </motion.div>
        <div className="mt-2 text-sm text-zinc-400 font-medium">
          {isDebt ? 'Pushups Owed' : balance === 0 ? 'Balanced' : 'Extra Pushups'}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3 mb-6 relative">
        <motion.button
          whileHover={isAuthed ? { scale: 1.02 } : {}}
          whileTap={isAuthed ? { scale: 0.98 } : {}}
          onClick={handleCigarette}
          disabled={loading || !isAuthed || showCaloriesInput}
          className="flex flex-col items-center justify-center gap-1.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 font-medium py-3 px-4 rounded-2xl border border-zinc-200/80 transition-all disabled:opacity-40 disabled:cursor-not-allowed group h-20"
        >
          <Cigarette className="w-5 h-5 text-zinc-400 group-hover:text-zinc-700 transition-colors" />
          <div className="flex items-center gap-1 text-sm">
            <span>Smoke</span>
            <span className="text-xs text-zinc-400">+100</span>
          </div>
        </motion.button>

        <div className="relative h-20">
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
                className="w-full h-full flex flex-col items-center justify-center gap-1.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 font-medium py-3 px-4 rounded-2xl border border-zinc-200/80 transition-all disabled:opacity-40 disabled:cursor-not-allowed group absolute inset-0"
              >
                <Dumbbell className="w-5 h-5 text-zinc-400 group-hover:text-zinc-700 transition-colors" />
                <div className="flex items-center gap-1 text-sm">
                  <span>Workout</span>
                  <span className="text-xs text-zinc-400">-100</span>
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
                className="w-full h-full flex flex-col gap-1 absolute inset-0 bg-white rounded-2xl border border-zinc-200 p-2 shadow-sm"
              >
                <input
                  type="number"
                  autoFocus
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  placeholder="Calories?"
                  min="0"
                  disabled={loading}
                  className="w-full bg-zinc-50 border border-zinc-200 text-zinc-800 placeholder-zinc-400 px-2 flex-1 text-sm rounded-lg font-medium focus:outline-none focus:ring-1 focus:ring-zinc-900/10 focus:border-zinc-300 transition-all text-center"
                />
                <div className="flex gap-1 h-6">
                  <button
                    type="button"
                    onClick={() => setShowCaloriesInput(false)}
                    disabled={loading}
                    className="flex-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-md text-[10px] uppercase font-bold tracking-wider transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white rounded-md text-[10px] uppercase font-bold tracking-wider transition-colors disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
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

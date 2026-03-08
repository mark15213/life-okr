'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Calendar, Dumbbell, Flame, Timer, CheckCircle2 } from 'lucide-react';
import { format, subDays } from 'date-fns';

interface BackfillModalProps {
    onSuccess: () => void;
}

export default function BackfillModal({ onSuccess }: BackfillModalProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    // Form state
    // Default to yesterday
    const [date, setDate] = useState(format(subDays(new Date(), 1), 'yyyy-MM-dd'));
    const [exercises, setExercises] = useState('');
    const [calories, setCalories] = useState('');
    const [focus, setFocus] = useState('');
    const [tasks, setTasks] = useState('');

    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const numExercises = exercises ? parseInt(exercises, 10) : 0;
        const numCalories = calories ? parseInt(calories, 10) : 0;
        const numFocus = focus ? parseInt(focus, 10) : 0;
        const numTasks = tasks ? parseInt(tasks, 10) : 0;

        if (numExercises === 0 && numCalories === 0 && numFocus === 0 && numTasks === 0) {
            setError('Please enter at least one value.');
            return;
        }

        if (!date) {
            setError('Date is required.');
            return;
        }

        setLoading(true);

        try {
            const res = await fetch('/api/records/backfill', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date,
                    exercises: numExercises,
                    calories: numCalories,
                    focus: numFocus,
                    tasks: numTasks,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to backfill data');
            }

            // Reset form
            setExercises('');
            setCalories('');
            setFocus('');
            setTasks('');
            setIsOpen(false);
            onSuccess();
        } catch (err: any) {
            setError(err.message || 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm"
            >
                <Plus className="w-4 h-4" />
                Log Past Data
            </button>

            <AnimatePresence>
                {isOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsOpen(false)}
                            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                        />

                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-zinc-200"
                        >
                            <button
                                onClick={() => setIsOpen(false)}
                                className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-zinc-900 bg-zinc-50 hover:bg-zinc-100 rounded-full transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>

                            <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 mb-6">
                                Backfill Data
                            </h2>

                            <form onSubmit={handleSubmit} className="space-y-5">
                                {/* Date Input */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-widest flex items-center gap-2 mb-2">
                                        <Calendar className="w-3.5 h-3.5" /> Date (YYYY-MM-DD)
                                    </label>
                                    <input
                                        type="date"
                                        required
                                        max={format(new Date(), 'yyyy-MM-dd')}
                                        value={date}
                                        onChange={(e) => setDate(e.target.value)}
                                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-300 transition-all font-medium text-zinc-900"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    {/* Exercises */}
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5 mb-1.5">
                                            <Dumbbell className="w-3.5 h-3.5 text-blue-500" /> Exercises
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            placeholder="Sets"
                                            value={exercises}
                                            onChange={(e) => setExercises(e.target.value)}
                                            className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-300 transition-all text-zinc-900"
                                        />
                                    </div>

                                    {/* Calories */}
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5 mb-1.5">
                                            <Flame className="w-3.5 h-3.5 text-orange-500" /> Calories
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            placeholder="kcal"
                                            value={calories}
                                            onChange={(e) => setCalories(e.target.value)}
                                            className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-300 transition-all text-zinc-900"
                                        />
                                    </div>

                                    {/* Focus Time */}
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5 mb-1.5">
                                            <Timer className="w-3.5 h-3.5 text-purple-500" /> Focus Time
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            placeholder="Minutes"
                                            value={focus}
                                            onChange={(e) => setFocus(e.target.value)}
                                            className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-300 transition-all text-zinc-900"
                                        />
                                    </div>

                                    {/* Tasks */}
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5 mb-1.5">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Tasks
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            placeholder="Count"
                                            value={tasks}
                                            onChange={(e) => setTasks(e.target.value)}
                                            className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-300 transition-all text-zinc-900"
                                        />
                                    </div>
                                </div>

                                {error && (
                                    <div className="text-red-500 text-sm font-medium bg-red-50 p-3 rounded-lg border border-red-100">
                                        {error}
                                    </div>
                                )}

                                <div className="pt-4 mt-2 border-t border-zinc-100 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsOpen(false)}
                                        className="flex-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-4 py-3 rounded-xl text-sm font-medium transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                    >
                                        {loading ? (
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            'Save Record'
                                        )}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
}

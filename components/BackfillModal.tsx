'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Calendar, Dumbbell, Sparkles, Timer, CheckCircle2, Lock } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { usePasscode } from '@/lib/usePasscode';

interface BackfillModalProps {
    onSuccess: () => void;
    isAuthed?: boolean;
    /** Icon-only trigger for headers that should stay quiet. */
    compact?: boolean;
}

// Mirrors CALORIES_PER_EXERCISE in app/api/records/backfill/route.ts — the server is what
// actually writes the number; this is only here so the form can say what it will be.
const CALORIES_PER_EXERCISE = 200;

export default function BackfillModal({ onSuccess, isAuthed, compact }: BackfillModalProps) {
    const passcode = usePasscode();
    const canWrite = isAuthed ?? passcode.isAuthed;
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    // Form state
    // Default to yesterday
    const [date, setDate] = useState(format(subDays(new Date(), 1), 'yyyy-MM-dd'));
    const [exercises, setExercises] = useState('');
    const [focus, setFocus] = useState('');
    const [tasks, setTasks] = useState('');
    const [tokens, setTokens] = useState('');

    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!canWrite) {
            setError('Unlock first to modify data.');
            return;
        }

        const numExercises = exercises ? parseInt(exercises, 10) : 0;
        const numFocus = focus ? parseInt(focus, 10) : 0;
        const numTasks = tasks ? parseInt(tasks, 10) : 0;
        // Blank means "leave the day's token total alone", so an empty field stays out of
        // the payload entirely rather than being sent as a 0 that would overwrite it.
        const numTokens = tokens.trim() ? parseInt(tokens, 10) : null;

        if (numTokens !== null && (!Number.isFinite(numTokens) || numTokens < 0)) {
            setError('Tokens must be a non-negative number.');
            return;
        }

        if (numExercises === 0 && numFocus === 0 && numTasks === 0 && numTokens === null) {
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
                credentials: 'same-origin',
                body: JSON.stringify({
                    date,
                    exercises: numExercises,
                    focus: numFocus,
                    tasks: numTasks,
                    ...(numTokens !== null ? { tokens: numTokens } : {}),
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(
                    res.status === 401
                        ? 'Unlock first to modify data.'
                        : data.error || 'Failed to backfill data'
                );
            }

            // Reset form
            setExercises('');
            setFocus('');
            setTasks('');
            setTokens('');
            setIsOpen(false);
            onSuccess();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            {compact ? (
                <button
                    onClick={() => canWrite && setIsOpen(true)}
                    disabled={!canWrite}
                    aria-label="Log Past Data"
                    title={canWrite ? 'Log past data' : 'Unlock first'}
                    className="flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-40"
                >
                    <Calendar className="w-4 h-4" />
                    Log
                </button>
            ) : (
                <button
                    onClick={() => canWrite && setIsOpen(true)}
                    disabled={!canWrite}
                    title={canWrite ? undefined : 'Unlock on the main dashboard first'}
                    className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-45"
                >
                    {canWrite ? <Plus className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                    {canWrite ? 'Log Past Data' : 'Locked'}
                </button>
            )}

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
                                        <p className="text-[11px] text-zinc-400">
                                            {CALORIES_PER_EXERCISE} kcal each
                                        </p>
                                    </div>

                                    {/* Codex Tokens */}
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5 mb-1.5">
                                            <Sparkles className="w-3.5 h-3.5 text-pink-500" /> Codex Tokens
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="1"
                                            placeholder="Total"
                                            value={tokens}
                                            onChange={(e) => setTokens(e.target.value)}
                                            className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-300 transition-all text-zinc-900"
                                        />
                                        <p className="text-[11px] text-zinc-400">
                                            Replaces the day&apos;s total
                                        </p>
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

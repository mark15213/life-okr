'use client';

import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DailyRecord } from '@/lib/db';
import { Gift, X, Plus, Clock, Lock, CheckCircle2, Dumbbell, Timer, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePasscode } from '@/lib/usePasscode';

interface Purchase {
    id: number;
    item_name: string;
    cost: number;
    created_at: string;
}

interface FloatingVaultProps {
    records: DailyRecord[];
    todayRecord: DailyRecord;
    cumulativeBalance: number;
    isAuthed: boolean;
}

export default function FloatingVault({ records, todayRecord, cumulativeBalance, isAuthed }: FloatingVaultProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [purchases, setPurchases] = useState<Purchase[]>([]);
    const [newItemName, setNewItemName] = useState('');
    const [newItemCost, setNewItemCost] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSparkle, setShowSparkle] = useState(false);

    // Fetch purchases on mount
    useEffect(() => {
        fetch('/api/vault')
            .then(res => res.json())
            .then(data => {
                if (data.purchases) setPurchases(data.purchases);
            });
    }, []);

    const handlePurchase = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isAuthed || !newItemName || !newItemCost) return;

        setIsSubmitting(true);
        try {
            const res = await fetch('/api/vault', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ item_name: newItemName, cost: parseInt(newItemCost) })
            });
            const data = await res.json();
            if (data.purchase) {
                setPurchases(p => [data.purchase, ...p]);
                setNewItemName('');
                setNewItemCost('');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const vault = useMemo(() => {
        const allRecords = [...records];
        const todayExists = allRecords.some(r => r.date === todayRecord.date);
        if (!todayExists) allRecords.push(todayRecord);

        let exerciseReward = 0;
        let qualifyingExercises = 0;

        // Only reward exercises if the user is out of pushup debt!
        if (cumulativeBalance <= 0) {
            for (const r of allRecords) {
                if (r.cigarettes === 0) qualifyingExercises += r.exercises;
            }
            exerciseReward = Math.floor(qualifyingExercises / 2) * 100;
        }

        const totalTasks = allRecords.reduce((sum, r) => sum + r.tasks_completed, 0);
        const taskReward = Math.floor(totalTasks / 10) * 100;

        const totalFocusMinutes = allRecords.reduce((sum, r) => sum + r.focus_minutes, 0);
        const focusReward = Math.floor(totalFocusMinutes / 300) * 100;

        const totalEarned = exerciseReward + taskReward + focusReward;
        const totalSpent = purchases.reduce((sum, p) => sum + p.cost, 0);
        const balance = totalEarned - totalSpent;

        return {
            balance,
            totalEarned,
            totalSpent,
            exerciseReward,
            qualifyingExercises,
            taskReward,
            totalTasks,
            focusReward,
            totalFocusMinutes,
        };
    }, [records, todayRecord, purchases, cumulativeBalance]);

    // Milestone effect trigger
    useEffect(() => {
        if (vault.totalEarned > 0 && vault.totalEarned % 500 === 0) {
            setShowSparkle(true);
            setTimeout(() => setShowSparkle(false), 2000);
        }
    }, [vault.totalEarned]);

    return (
        <>
            {/* Floating Action Button */}
            <motion.button
                onClick={() => setIsOpen(true)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="fixed bottom-8 right-8 z-40 flex items-center gap-3 bg-zinc-900 text-white px-5 py-3.5 rounded-full shadow-2xl shadow-indigo-500/20 border border-zinc-800 hover:bg-zinc-800 transition-colors group"
            >
                <div className="relative">
                    <Gift className="w-5 h-5 text-amber-400 group-hover:rotate-12 transition-transform" />
                    <AnimatePresence>
                        {showSparkle && (
                            <motion.div
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1.5, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                                className="absolute -top-2 -right-2"
                            >
                                <Star className="w-4 h-4 text-amber-300 fill-amber-300 animate-pulse" />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
                <div className="flex flex-col items-start leading-none">
                    <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-widest mb-0.5">Vault</span>
                    <span className="font-semibold">¥{vault.balance}</span>
                </div>
            </motion.button>

            {/* Modal Overlay */}
            <AnimatePresence>
                {isOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsOpen(false)}
                            className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
                        />

                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-lg bg-white rounded-[2rem] shadow-2xl border border-zinc-200/60 overflow-hidden flex flex-col max-h-[90vh]"
                        >
                            {/* Modal Header */}
                            <div className="p-6 pb-4 border-b border-zinc-100 flex items-start justify-between bg-zinc-50/50">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-amber-50 rounded-2xl">
                                        <Gift className="w-8 h-8 text-amber-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-semibold text-zinc-900">Reward Vault</h2>
                                        <p className="text-sm text-zinc-500">Balance: <strong className="text-zinc-900">¥{vault.balance}</strong> <span className="text-zinc-400 text-xs ml-1">(Earned: ¥{vault.totalEarned} · Spent: ¥{vault.totalSpent})</span></p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="p-2 hover:bg-zinc-100 rounded-full text-zinc-400 hover:text-zinc-600 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Scrollable Content */}
                            <div className="p-6 overflow-y-auto">
                                {/* Milestones */}
                                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">Next Milestones</h3>
                                <div className="grid grid-cols-1 gap-2 mb-8">
                                    <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 border border-zinc-100">
                                        <div className="flex items-center gap-2 text-sm text-zinc-600">
                                            <Dumbbell className="w-4 h-4 text-emerald-500" /> Smoke-free Workouts
                                        </div>
                                        <div className="text-xs font-medium text-zinc-400">
                                            {vault.qualifyingExercises} / {(Math.floor(vault.qualifyingExercises / 2) + 1) * 2}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 border border-zinc-100">
                                        <div className="flex items-center gap-2 text-sm text-zinc-600">
                                            <CheckCircle2 className="w-4 h-4 text-purple-500" /> Tasks Logged
                                        </div>
                                        <div className="text-xs font-medium text-zinc-400">
                                            {vault.totalTasks} / {(Math.floor(vault.totalTasks / 10) + 1) * 10}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 border border-zinc-100">
                                        <div className="flex items-center gap-2 text-sm text-zinc-600">
                                            <Timer className="w-4 h-4 text-cyan-500" /> Focus Time
                                        </div>
                                        <div className="text-xs font-medium text-zinc-400">
                                            {Math.floor(vault.totalFocusMinutes / 60)}h / {(Math.floor(vault.totalFocusMinutes / 300) + 1) * 5}h
                                        </div>
                                    </div>
                                </div>

                                {/* Purchase Form */}
                                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">Redeem Rewards</h3>
                                {!isAuthed ? (
                                    <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-center gap-2 text-sm text-zinc-500 mb-8">
                                        <Lock className="w-4 h-4" /> Unlock vault on main dashboard to purchase
                                    </div>
                                ) : (
                                    <form onSubmit={handlePurchase} className="flex gap-2 mb-8">
                                        <input
                                            type="text"
                                            placeholder="What did you buy?"
                                            value={newItemName}
                                            onChange={e => setNewItemName(e.target.value)}
                                            className="flex-1 px-3 py-2 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                                        />
                                        <input
                                            type="number"
                                            placeholder="Cost"
                                            value={newItemCost}
                                            onChange={e => setNewItemCost(e.target.value)}
                                            min="1"
                                            className="w-24 px-3 py-2 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                                        />
                                        <button
                                            type="submit"
                                            disabled={isSubmitting || !newItemName || !newItemCost}
                                            className="px-4 py-2 bg-zinc-900 text-white font-medium rounded-xl text-sm hover:bg-zinc-800 disabled:opacity-50 transition-colors flex items-center gap-1"
                                        >
                                            <Plus className="w-4 h-4" /> Add
                                        </button>
                                    </form>
                                )}

                                {/* History */}
                                <div className="flex items-center gap-2 mb-3">
                                    <Clock className="w-4 h-4 text-zinc-400" />
                                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">History</h3>
                                    {!isAuthed && <Lock className="w-3 h-3 text-zinc-300 ml-1" />}
                                </div>

                                <div className="space-y-2">
                                    {purchases.length === 0 ? (
                                        <div className="text-center py-6 text-sm text-zinc-400">No purchases yet. Treat yourself!</div>
                                    ) : (
                                        purchases.map(p => (
                                            <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 hover:bg-zinc-100/50 transition-colors group">
                                                <div className="flex flex-col">
                                                    <span className={cn(
                                                        "text-sm font-medium",
                                                        !isAuthed ? "text-transparent bg-zinc-300 rounded select-none blur-[4px]" : "text-zinc-700"
                                                    )}>
                                                        {!isAuthed ? "Purchase Hidden" : p.item_name}
                                                    </span>
                                                    <span className="text-[10px] text-zinc-400 mt-0.5">
                                                        {new Date(p.created_at).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                <span className="text-sm font-semibold text-zinc-900">-¥{p.cost}</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
}

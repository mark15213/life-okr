import type { DailyRecord } from './db';

/**
 * The vault changed reward rates on this date. Days before it are not re-valued at the
 * new rates — their earnings are frozen into LEGACY_EARNED — so the balance did not jump
 * when the rates changed, and backfilling an old day can no longer mint currency for a
 * period that was already settled.
 */
export const VAULT_EPOCH = '2026-08-19';

/**
 * Everything earned before VAULT_EPOCH, under the rates in force at the time (one reward
 * per 10 tasks / 300 focus minutes / 2 smoke-free exercises), summed once and frozen:
 *
 *   tasks     210  ->  floor(210 / 10)  * 100 = 2100
 *   focus    9085  ->  floor(9085 / 300) * 100 = 3000
 *   exercise   27  ->  0, the old all-or-nothing gate was shut at cutover (balance +6600)
 *
 * Derived from daily_records on 2026-08-19 over the 140 rows spanning 2026-03-05..08-18.
 * Re-deriving it means replaying those old rates; it is deliberately not recomputed.
 */
export const LEGACY_EARNED = 5100;

export const REWARD = 100;
export const TASKS_PER_REWARD = 5;
export const FOCUS_MINUTES_PER_REWARD = 180;
export const EXERCISES_PER_REWARD = 2;

export interface VaultEarnings {
    totalEarned: number;
    exerciseReward: number;
    qualifyingExercises: number;
    taskReward: number;
    totalTasks: number;
    totalFocusMinutes: number;
    focusReward: number;
}

/**
 * Earnings from VAULT_EPOCH onward, on top of the frozen legacy total.
 *
 * `records` may arrive in any order and cover any window — days before the epoch are
 * ignored, and a date appearing twice keeps the last copy, so callers can append an
 * optimistically-updated today over the fetched one. TickTick columns must already be
 * summed in (see `withTicktickSummed`).
 *
 * `cumulativePushupBalance` is the all-time SUM(pushup_balance); the exercise replay
 * needs it to recover the balance the epoch opened on.
 */
export function computeVaultEarnings(
    records: DailyRecord[],
    cumulativePushupBalance: number,
): VaultEarnings {
    const byDate = new Map<string, DailyRecord>();
    for (const r of records) {
        if (r.date >= VAULT_EPOCH) byDate.set(r.date, r);
    }
    const era = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

    // The whole era is in hand, so subtracting it from the all-time sum leaves the
    // balance as it stood the day before the epoch.
    let balance = era.reduce((sum, r) => sum - r.pushup_balance, cumulativePushupBalance);

    let qualifyingExercises = 0;
    let totalTasks = 0;
    let totalFocusMinutes = 0;

    for (const r of era) {
        balance += r.pushup_balance;
        // Exercises only pay while the pushup ledger is settled, judged day by day rather
        // than by one global flag: sliding back into debt stops new rewards instead of
        // erasing the ones already banked.
        if (balance <= 0 && r.cigarettes === 0) qualifyingExercises += r.exercises;
        totalTasks += r.tasks_completed;
        totalFocusMinutes += r.focus_minutes;
    }

    const exerciseReward = Math.floor(qualifyingExercises / EXERCISES_PER_REWARD) * REWARD;
    const taskReward = Math.floor(totalTasks / TASKS_PER_REWARD) * REWARD;
    const focusReward = Math.floor(totalFocusMinutes / FOCUS_MINUTES_PER_REWARD) * REWARD;

    return {
        totalEarned: LEGACY_EARNED + exerciseReward + taskReward + focusReward,
        exerciseReward,
        qualifyingExercises,
        taskReward,
        totalTasks,
        totalFocusMinutes,
        focusReward,
    };
}

/** The count that would complete the next reward for a metric earning one per `per`. */
export function nextMilestone(current: number, per: number): number {
    return (Math.floor(current / per) + 1) * per;
}

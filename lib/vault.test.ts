import test from 'node:test';
import assert from 'node:assert/strict';
import type { DailyRecord } from './db';
import { computeVaultEarnings, nextMilestone, LEGACY_EARNED, VAULT_EPOCH } from './vault';

function day(date: string, fields: Partial<DailyRecord> = {}): DailyRecord {
    return {
        id: 0,
        date,
        cigarettes: 0,
        exercises: 0,
        pushup_balance: 0,
        focus_minutes: 0,
        tasks_completed: 0,
        calories_burned: 0,
        focus_minutes_ticktick: 0,
        tasks_completed_ticktick: 0,
        ticktick_synced_at: null,
        created_at: new Date(0),
        updated_at: new Date(0),
        ...fields,
    };
}

test('no records earns exactly the frozen legacy total', () => {
    assert.equal(computeVaultEarnings([], 0).totalEarned, LEGACY_EARNED);
});

test('days before the epoch are ignored, not re-valued at the new rates', () => {
    const earnings = computeVaultEarnings(
        [day('2026-08-18', { tasks_completed: 500, focus_minutes: 5000 })],
        0,
    );
    assert.equal(earnings.totalEarned, LEGACY_EARNED);
    assert.equal(earnings.totalTasks, 0);
});

test('the epoch day itself counts', () => {
    const earnings = computeVaultEarnings([day(VAULT_EPOCH, { tasks_completed: 5 })], 0);
    assert.equal(earnings.taskReward, 100);
});

test('tasks pay 100 per 5, dropping the remainder', () => {
    const earnings = computeVaultEarnings(
        [day('2026-08-19', { tasks_completed: 7 }), day('2026-08-20', { tasks_completed: 6 })],
        0,
    );
    assert.equal(earnings.totalTasks, 13);
    assert.equal(earnings.taskReward, 200);
});

test('focus pays 100 per 180 minutes, dropping the remainder', () => {
    const earnings = computeVaultEarnings(
        [day('2026-08-19', { focus_minutes: 200 }), day('2026-08-20', { focus_minutes: 179 })],
        0,
    );
    assert.equal(earnings.totalFocusMinutes, 379);
    assert.equal(earnings.focusReward, 200);
});

test('exercises on a day with a cigarette do not qualify', () => {
    const earnings = computeVaultEarnings(
        [day('2026-08-19', { exercises: 4, cigarettes: 1, pushup_balance: 100 })],
        100,
    );
    assert.equal(earnings.qualifyingExercises, 0);
});

test('exercises do not pay while the pushup ledger opens in debt', () => {
    // Opens at +300 and each exercise pays down 100, so the ledger is still short after two.
    const earnings = computeVaultEarnings(
        [day('2026-08-19', { exercises: 2, pushup_balance: -200 })],
        100,
    );
    assert.equal(earnings.qualifyingExercises, 0);
    assert.equal(earnings.exerciseReward, 0);
});

test('exercises resume paying on the day the debt is cleared', () => {
    // Opens at +200: the first day stays short, the second settles it and counts.
    const earnings = computeVaultEarnings(
        [
            day('2026-08-19', { exercises: 1, pushup_balance: -100 }),
            day('2026-08-20', { exercises: 2, pushup_balance: -200 }),
        ],
        -100,
    );
    assert.equal(earnings.qualifyingExercises, 2);
    assert.equal(earnings.exerciseReward, 100);
});

test('falling back into debt stops new rewards without erasing banked ones', () => {
    const settled = [
        day('2026-08-19', { exercises: 2, pushup_balance: -200 }),
        day('2026-08-20', { cigarettes: 5, pushup_balance: 500 }),
        day('2026-08-21', { exercises: 2, pushup_balance: -200 }),
    ];
    const earnings = computeVaultEarnings(settled, 100);
    // Day 1 qualifies (balance 0); days 2-3 are back in debt (+500 then +300).
    assert.equal(earnings.qualifyingExercises, 2);
    assert.equal(earnings.exerciseReward, 100);
});

test('record order does not change the outcome', () => {
    const records = [
        day('2026-08-21', { exercises: 2, pushup_balance: -200 }),
        day('2026-08-19', { exercises: 1, pushup_balance: -100 }),
        day('2026-08-20', { cigarettes: 4, pushup_balance: 400 }),
    ];
    const forward = computeVaultEarnings([...records].reverse(), 100);
    const shuffled = computeVaultEarnings(records, 100);
    assert.deepEqual(forward, shuffled);
});

test('a repeated date keeps the last copy so optimistic updates win', () => {
    const earnings = computeVaultEarnings(
        [day('2026-08-19', { tasks_completed: 5 }), day('2026-08-19', { tasks_completed: 10 })],
        0,
    );
    assert.equal(earnings.totalTasks, 10);
});

test('nextMilestone reports the count that completes the next reward', () => {
    assert.equal(nextMilestone(0, 5), 5);
    assert.equal(nextMilestone(4, 5), 5);
    assert.equal(nextMilestone(5, 5), 10);
    assert.equal(nextMilestone(181, 180), 360);
});

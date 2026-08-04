import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { emptyCategoryTotals, type CategorizedTotal } from './aggregate';
import { getDayRange, type LocalDay } from './day';
import { planSync } from './sync';

const TZ = 'Asia/Shanghai';

const day = (date: string): LocalDay => ({ date, range: getDayRange(date, TZ) });

function totals(total: number, byCategory: Partial<Record<string, number>> = {}): CategorizedTotal {
  const cats = emptyCategoryTotals();
  for (const [k, v] of Object.entries(byCategory)) cats[k as keyof typeof cats] = v ?? 0;
  return { total, byCategory: cats };
}

const WINDOW = [day('2026-08-02'), day('2026-08-03'), day('2026-08-04')];
const TODAY = '2026-08-04';

function plan(
  focus: Record<string, CategorizedTotal>,
  tasks: Record<string, CategorizedTotal> = {}
) {
  return planSync(WINDOW, new Map(Object.entries(focus)), new Map(Object.entries(tasks)), TODAY);
}

test('today is written even when it reports nothing', () => {
  // Deleting the day's only session in TickTick has to be able to bring the stored value
  // back down to zero, so today is never skipped.
  const result = plan({ '2026-08-04': totals(0) });

  const today = result.writes.find((w) => w.date === TODAY);
  assert.ok(today, 'today must be written');
  assert.equal(today.focusMinutes, 0);
  assert.ok(!result.skipped.includes(TODAY));
});

test('a past day reporting nothing is skipped, not zeroed', () => {
  // Zero is ambiguous for a past day: genuinely empty, or the timeline no longer reaches
  // back that far. Overwriting real history with an ambiguous zero is unrecoverable.
  const result = plan({ '2026-08-02': totals(0), '2026-08-03': totals(0), '2026-08-04': totals(0) });

  assert.deepEqual(result.skipped, ['2026-08-02', '2026-08-03']);
  assert.deepEqual(result.writes.map((w) => w.date), [TODAY]);
});

test('a past day with focus is written', () => {
  const result = plan({ '2026-08-03': totals(175, { work: 150, life: 25 }) });

  const written = result.writes.find((w) => w.date === '2026-08-03');
  assert.equal(written?.focusMinutes, 175);
  assert.equal(written?.byCategory.work.focusMinutes, 150);
  assert.equal(written?.byCategory.life.focusMinutes, 25);
});

test('a past day with completed tasks but no focus is still written', () => {
  const result = plan({ '2026-08-03': totals(0) }, { '2026-08-03': totals(2, { work: 2 }) });

  const written = result.writes.find((w) => w.date === '2026-08-03');
  assert.ok(written, 'a day with task activity is not empty');
  assert.equal(written.tasksCompleted, 2);
  assert.equal(written.byCategory.work.tasksCompleted, 2);
});

test('focus and task categories are merged per day', () => {
  const result = plan(
    { '2026-08-04': totals(50, { work: 50 }) },
    { '2026-08-04': totals(3, { life: 3 }) }
  );

  const written = result.writes.find((w) => w.date === TODAY)!;
  assert.equal(written.byCategory.work.focusMinutes, 50);
  assert.equal(written.byCategory.work.tasksCompleted, 0);
  assert.equal(written.byCategory.life.focusMinutes, 0);
  assert.equal(written.byCategory.life.tasksCompleted, 3);
});

test('a day missing from the fetched maps counts as empty rather than throwing', () => {
  // A partial response should degrade to the skip rule, not crash the whole sync and take
  // the other days' writes down with it.
  const result = plan({});

  assert.deepEqual(result.skipped, ['2026-08-02', '2026-08-03']);
  assert.equal(result.writes.length, 1);
  assert.equal(result.writes[0].focusMinutes, 0);
});

test('writes preserve the window order, oldest first', () => {
  const result = plan({
    '2026-08-02': totals(25, { work: 25 }),
    '2026-08-03': totals(175, { work: 175 }),
    '2026-08-04': totals(25, { life: 25 }),
  });

  assert.deepEqual(result.writes.map((w) => w.date), ['2026-08-02', '2026-08-03', '2026-08-04']);
});

test('every category key is present on a write, so a dropped category is zeroed not left stale', () => {
  const result = plan({ '2026-08-04': totals(25, { life: 25 }) });
  const written = result.writes.find((w) => w.date === TODAY)!;

  assert.deepEqual(Object.keys(written.byCategory).sort(), [
    'hustle', 'life', 'study', 'uncategorized', 'work',
  ]);
  assert.equal(written.byCategory.work.focusMinutes, 0);
});

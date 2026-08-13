import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  CATEGORIES,
  categoryFromProjectName,
  countCompletedTasksByCategory,
  countCompletedTasksToday,
  sumFocusMinutesByCategory,
  sumFocusMinutesToday,
  type Category,
  type CategoryTotals,
  type TickTickPomodoro,
} from './aggregate';

const range = {
  startMs: new Date(2026, 4, 24, 0, 0, 0).getTime(),
  endMs: new Date(2026, 4, 25, 0, 0, 0).getTime(),
};

const iso = (h: number, m: number, s = 0, day = 24) =>
  new Date(2026, 4, day, h, m, s).toISOString();

function sumParts(byCategory: CategoryTotals): number {
  return CATEGORIES.reduce((s, c) => s + byCategory[c], 0);
}

const PROJECTS = new Map<string, Category>([
  ['p-work', 'work'],
  ['p-study', 'study'],
  ['p-hustle', 'hustle'],
  ['p-life', 'life'],
]);

test('counts only status=2 tasks completed within today range', () => {
  const tasks = [
    { status: 2, completedTime: new Date(2026, 4, 24, 10, 0, 0).toISOString() },  // today, done
    { status: 2, completedTime: new Date(2026, 4, 24, 23, 59, 59).toISOString() }, // today, done
    { status: 2, completedTime: new Date(2026, 4, 23, 23, 0, 0).toISOString() },  // yesterday — skip
    { status: 0, completedTime: null },                                              // not done — skip
    { status: 2, completedTime: null },                                              // done but no time — skip
    { status: 2, completedTime: new Date(2026, 4, 25, 0, 0, 1).toISOString() },    // tomorrow — skip
  ];
  assert.equal(countCompletedTasksToday(tasks, range), 2);
});

test("won't-do tasks never count as work done, in the total or in any category", () => {
  // Not hypothetical: /project/all/completed/ hands abandoned tasks (status -1) back mixed
  // in with real completions, timestamped exactly like them. The status filter is the only
  // thing keeping them out, and the panel now creates them by the click.
  const tasks = [
    { status: 2, completedTime: new Date(2026, 4, 24, 10, 0, 0).toISOString(), projectId: 'p-work' },
    { status: -1, completedTime: new Date(2026, 4, 24, 11, 0, 0).toISOString(), projectId: 'p-work' },
    { status: -1, completedTime: new Date(2026, 4, 24, 12, 0, 0).toISOString(), projectId: 'p-study' },
  ];

  assert.equal(countCompletedTasksToday(tasks, range), 1);

  const split = countCompletedTasksByCategory(tasks, range, PROJECTS);
  assert.equal(split.total, 1);
  assert.equal(split.byCategory.work, 1);
  assert.equal(split.byCategory.study, 0);
});

test('returns 0 on empty list', () => {
  assert.equal(countCompletedTasksToday([], range), 0);
});

test('handles malformed completedTime by skipping', () => {
  const tasks = [
    { status: 2, completedTime: 'not-a-date' },
    { status: 2, completedTime: new Date(2026, 4, 24, 12, 0, 0).toISOString() },
  ];
  assert.equal(countCompletedTasksToday(tasks, range), 1);
});

test('sums pomodoro durations (end-start-pause) for sessions started today', () => {
  const pomodoros = [
    // 25 min today
    {
      startTime: new Date(2026, 4, 24, 9, 0, 0).toISOString(),
      endTime: new Date(2026, 4, 24, 9, 25, 0).toISOString(),
    },
    // 30 min today, with 60s pause → 29 min effective
    {
      startTime: new Date(2026, 4, 24, 14, 30, 0).toISOString(),
      endTime: new Date(2026, 4, 24, 15, 0, 0).toISOString(),
      pauseDuration: 60,
    },
    // yesterday — skip
    {
      startTime: new Date(2026, 4, 23, 22, 0, 0).toISOString(),
      endTime: new Date(2026, 4, 23, 22, 25, 0).toISOString(),
    },
    // malformed — skip
    { startTime: 'not-a-date', endTime: 'also-not-a-date' },
  ];
  // 25 + 29 = 54 min
  assert.equal(sumFocusMinutesToday(pomodoros, range), 54);
});

test('sumFocusMinutesToday rounds to nearest integer minute', () => {
  const pomodoros = [
    // 90 seconds → 1.5 min → 2
    {
      startTime: new Date(2026, 4, 24, 9, 0, 0).toISOString(),
      endTime: new Date(2026, 4, 24, 9, 1, 30).toISOString(),
    },
  ];
  assert.equal(sumFocusMinutesToday(pomodoros, range), 2);
});

test('sumFocusMinutesToday returns 0 on empty list', () => {
  assert.equal(sumFocusMinutesToday([], range), 0);
});

// ───────────────────────── category mapping ─────────────────────────

test('categoryFromProjectName matches the four lists case- and space-insensitively', () => {
  assert.equal(categoryFromProjectName('Work'), 'work');
  assert.equal(categoryFromProjectName('  study '), 'study');
  assert.equal(categoryFromProjectName('HUSTLE'), 'hustle');
  assert.equal(categoryFromProjectName('Life'), 'life');
});

test('categoryFromProjectName sends Inbox (in either locale) and unknowns to uncategorized', () => {
  assert.equal(categoryFromProjectName('Inbox'), 'uncategorized');
  assert.equal(categoryFromProjectName('收集箱'), 'uncategorized');
  assert.equal(categoryFromProjectName('Someday/Maybe'), 'uncategorized');
  assert.equal(categoryFromProjectName(null), 'uncategorized');
  assert.equal(categoryFromProjectName(undefined), 'uncategorized');
});

// ───────────────────────── tasks by category ─────────────────────────

test('countCompletedTasksByCategory splits by project and reconciles with the plain count', () => {
  const tasks = [
    { status: 2, completedTime: iso(9, 0), projectId: 'p-work' },
    { status: 2, completedTime: iso(10, 0), projectId: 'p-work' },
    { status: 2, completedTime: iso(11, 0), projectId: 'p-study' },
    { status: 2, completedTime: iso(12, 0), projectId: 'inbox124924009' }, // unknown id
    { status: 2, completedTime: iso(13, 0) },                              // no projectId at all
    { status: 0, completedTime: null, projectId: 'p-work' },               // not done — skip
    { status: 2, completedTime: new Date(2026, 4, 23, 9, 0, 0).toISOString(), projectId: 'p-life' }, // yesterday
  ];
  const { total, byCategory } = countCompletedTasksByCategory(tasks, range, PROJECTS);

  assert.equal(byCategory.work, 2);
  assert.equal(byCategory.study, 1);
  assert.equal(byCategory.uncategorized, 2);
  assert.equal(byCategory.life, 0);
  assert.equal(total, 5);
  assert.equal(total, countCompletedTasksToday(tasks, range));
  assert.equal(sumParts(byCategory), total);
});

test('countCompletedTasksByCategory returns all zeros on empty input', () => {
  const { total, byCategory } = countCompletedTasksByCategory([], range, PROJECTS);
  assert.equal(total, 0);
  assert.equal(sumParts(byCategory), 0);
});

// ───────────────────────── focus by category ─────────────────────────

test('attributes a single-task session entirely to that task list', () => {
  const pomodoros: TickTickPomodoro[] = [
    {
      startTime: iso(9, 0),
      endTime: iso(9, 25),
      tasks: [{ projectName: 'Work', startTime: iso(9, 0), endTime: iso(9, 25) }],
    },
  ];
  const { total, byCategory } = sumFocusMinutesByCategory(pomodoros, range);
  assert.equal(total, 25);
  assert.equal(byCategory.work, 25);
  assert.equal(sumParts(byCategory), total);
});

test('splits a multi-task session proportionally and still sums to the total', () => {
  // 60 min session: 40 min on Work, 20 min on Study
  const pomodoros: TickTickPomodoro[] = [
    {
      startTime: iso(9, 0),
      endTime: iso(10, 0),
      tasks: [
        { projectName: 'Work', startTime: iso(9, 0), endTime: iso(9, 40) },
        { projectName: 'Study', startTime: iso(9, 40), endTime: iso(10, 0) },
      ],
    },
  ];
  const { total, byCategory } = sumFocusMinutesByCategory(pomodoros, range);
  assert.equal(total, 60);
  assert.equal(byCategory.work, 40);
  assert.equal(byCategory.study, 20);
  assert.equal(sumParts(byCategory), total);
});

test('accumulates two entries of the same category rather than overwriting', () => {
  const pomodoros: TickTickPomodoro[] = [
    {
      startTime: iso(9, 0),
      endTime: iso(10, 0),
      tasks: [
        { projectName: 'Work', startTime: iso(9, 0), endTime: iso(9, 30) },
        { projectName: 'Work', startTime: iso(9, 30), endTime: iso(10, 0) },
      ],
    },
  ];
  const { total, byCategory } = sumFocusMinutesByCategory(pomodoros, range);
  assert.equal(total, 60);
  assert.equal(byCategory.work, 60);
  assert.equal(sumParts(byCategory), total);
});

test('a session with no tasks[] goes wholly to uncategorized', () => {
  const pomodoros: TickTickPomodoro[] = [
    { startTime: iso(9, 0), endTime: iso(9, 25) },
    { startTime: iso(10, 0), endTime: iso(10, 25), tasks: [] },
  ];
  const { total, byCategory } = sumFocusMinutesByCategory(pomodoros, range);
  assert.equal(total, 50);
  assert.equal(byCategory.uncategorized, 50);
  assert.equal(sumParts(byCategory), total);
});

test('zero-duration entries fall back to an equal split instead of producing NaN', () => {
  // Instant task switch: every entry has startTime === endTime, so all weights are 0.
  const pomodoros: TickTickPomodoro[] = [
    {
      startTime: iso(9, 0),
      endTime: iso(9, 30),
      tasks: [
        { projectName: 'Work', startTime: iso(9, 0), endTime: iso(9, 0) },
        { projectName: 'Study', startTime: iso(9, 0), endTime: iso(9, 0) },
      ],
    },
  ];
  const { total, byCategory } = sumFocusMinutesByCategory(pomodoros, range);
  assert.equal(total, 30);
  assert.equal(byCategory.work, 15);
  assert.equal(byCategory.study, 15);
  for (const c of CATEGORIES) assert.ok(Number.isInteger(byCategory[c]), `${c} is not an integer`);
  assert.equal(sumParts(byCategory), total);
});

test('an entry with endTime: null contributes no weight and cannot go negative', () => {
  // new Date(null).getTime() is 0, not NaN — an unclamped weight here would be ≈ -1.8e12.
  const pomodoros: TickTickPomodoro[] = [
    {
      startTime: iso(9, 0),
      endTime: iso(9, 30),
      tasks: [
        { projectName: 'Work', startTime: iso(9, 0), endTime: iso(9, 30) },
        { projectName: 'Study', startTime: iso(9, 30), endTime: null },
      ],
    },
  ];
  const { total, byCategory } = sumFocusMinutesByCategory(pomodoros, range);
  assert.equal(total, 30);
  assert.equal(byCategory.work, 30);
  assert.equal(byCategory.study, 0);
  for (const c of CATEGORIES) assert.ok(byCategory[c] >= 0, `${c} went negative`);
  assert.equal(sumParts(byCategory), total);
});

test('entry durations overflowing the session are treated as weights, not seconds', () => {
  // Entries claim 60 min inside a 30 min session; normalization keeps the total honest.
  const pomodoros: TickTickPomodoro[] = [
    {
      startTime: iso(9, 0),
      endTime: iso(9, 30),
      tasks: [
        { projectName: 'Work', startTime: iso(9, 0), endTime: iso(9, 45) },
        { projectName: 'Life', startTime: iso(9, 0), endTime: iso(9, 15) },
      ],
    },
  ];
  const { total, byCategory } = sumFocusMinutesByCategory(pomodoros, range);
  assert.equal(total, 30);
  assert.equal(byCategory.work + byCategory.life, 30);
  assert.equal(sumParts(byCategory), total);
});

test('a midnight-crossing session counts wholly on its start date', () => {
  // 23:40 → 00:20. The tasks[] entries carry next-day timestamps; they must not be filtered.
  const pomodoros: TickTickPomodoro[] = [
    {
      startTime: iso(23, 40),
      endTime: new Date(2026, 4, 25, 0, 20, 0).toISOString(),
      tasks: [
        { projectName: 'Hustle', startTime: iso(23, 40), endTime: new Date(2026, 4, 25, 0, 20, 0).toISOString() },
      ],
    },
  ];
  const { total, byCategory } = sumFocusMinutesByCategory(pomodoros, range);
  assert.equal(total, 40);
  assert.equal(byCategory.hustle, 40);
  assert.equal(sumParts(byCategory), total);
});

test('pauseDuration is deducted before the split', () => {
  const pomodoros: TickTickPomodoro[] = [
    {
      startTime: iso(9, 0),
      endTime: iso(10, 0),
      pauseDuration: 600, // 10 min → 50 min effective
      tasks: [
        { projectName: 'Work', startTime: iso(9, 0), endTime: iso(9, 30) },
        { projectName: 'Study', startTime: iso(9, 30), endTime: iso(10, 0) },
      ],
    },
  ];
  const { total, byCategory } = sumFocusMinutesByCategory(pomodoros, range);
  assert.equal(total, 50);
  assert.equal(byCategory.work, 25);
  assert.equal(byCategory.study, 25);
  assert.equal(sumParts(byCategory), total);
});

test('apportionment never drifts from sumFocusMinutesToday, even with awkward remainders', () => {
  // Three-way split of a duration that does not divide evenly, plus an uncategorized session.
  const pomodoros: TickTickPomodoro[] = [
    {
      startTime: iso(9, 0),
      endTime: iso(9, 50),
      tasks: [
        { projectName: 'Work', startTime: iso(9, 0), endTime: iso(9, 17) },
        { projectName: 'Study', startTime: iso(9, 17), endTime: iso(9, 34) },
        { projectName: 'Life', startTime: iso(9, 34), endTime: iso(9, 50) },
      ],
    },
    { startTime: iso(14, 0), endTime: iso(14, 7), pauseDuration: 13 },
    {
      startTime: iso(16, 0),
      endTime: iso(16, 23),
      tasks: [{ projectName: '收集箱', startTime: iso(16, 0), endTime: iso(16, 23) }],
    },
  ];
  const { total, byCategory } = sumFocusMinutesByCategory(pomodoros, range);
  assert.equal(total, sumFocusMinutesToday(pomodoros, range));
  assert.equal(sumParts(byCategory), total);
  for (const c of CATEGORIES) assert.ok(Number.isInteger(byCategory[c]), `${c} is not an integer`);
});

test('sumFocusMinutesByCategory returns all zeros on empty input', () => {
  const { total, byCategory } = sumFocusMinutesByCategory([], range);
  assert.equal(total, 0);
  assert.equal(sumParts(byCategory), 0);
});

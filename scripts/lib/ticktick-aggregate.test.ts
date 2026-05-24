import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { countCompletedTasksToday } from './ticktick-aggregate';

const range = {
  startMs: new Date(2026, 4, 24, 0, 0, 0).getTime(),
  endMs: new Date(2026, 4, 25, 0, 0, 0).getTime(),
};

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

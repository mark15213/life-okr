import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { countCompletedTasksToday, sumFocusMinutesToday } from './ticktick-aggregate';

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

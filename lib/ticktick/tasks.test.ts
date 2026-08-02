import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { TaskListKey } from './lists';
import {
  classifyDue,
  effectiveDueMs,
  formatDueLabel,
  isOpenTask,
  sortPanelTasks,
  toPanelTask,
  type PanelTask,
  type RawTickTickTask,
} from './tasks';

const TZ = 'Asia/Shanghai';

/** 2026-08-03 12:00 in Asia/Shanghai. Every case below is read relative to this instant. */
const NOW = new Date('2026-08-03T04:00:00.000Z');

function task(overrides: Partial<RawTickTickTask> = {}): RawTickTickTask {
  return { id: 'a1', title: 'Something', status: 0, ...overrides };
}

test('effectiveDueMs backs an all-day task off its exclusive end boundary', () => {
  // TickTick stores "due Aug 3, all day" as midnight Aug 4 local. Formatting that instant
  // as-is puts the task a day late, so the helper steps back to the last ms of Aug 3.
  const allDay = task({ dueDate: '2026-08-03T16:00:00.000+0000', isAllDay: true });
  const ms = effectiveDueMs(allDay);

  assert.equal(ms, Date.parse('2026-08-03T16:00:00.000+0000') - 1);
  assert.equal(new Date(ms!).toLocaleDateString('en-CA', { timeZone: TZ }), '2026-08-03');
});

test('effectiveDueMs leaves a timed task exactly where it is', () => {
  const timed = task({ dueDate: '2026-08-03T10:00:00.000+0000', isAllDay: false });
  assert.equal(effectiveDueMs(timed), Date.parse('2026-08-03T10:00:00.000+0000'));
});

test('effectiveDueMs is null for an undated task and for an unparseable date', () => {
  assert.equal(effectiveDueMs(task()), null);
  assert.equal(effectiveDueMs(task({ dueDate: null })), null);
  assert.equal(effectiveDueMs(task({ dueDate: 'not a date' })), null);
});

test('classifyDue puts an all-day task due today in today, not overdue', () => {
  const allDayToday = task({ dueDate: '2026-08-03T16:00:00.000+0000', isAllDay: true });
  assert.equal(classifyDue(allDayToday, NOW, TZ), 'today');
});

test('classifyDue treats a timed task whose moment has passed as overdue', () => {
  // 09:00 local, and it is 12:00. Every TickTick client shows this as overdue, and the
  // capture flow stamps new tasks as due right now — without this they would all sit
  // under a calm "Today" heading within the minute.
  const earlierToday = task({ dueDate: '2026-08-03T01:00:00.000+0000', isAllDay: false });
  assert.equal(classifyDue(earlierToday, NOW, TZ), 'overdue');
});

test('classifyDue keeps a timed task still ahead of now in today', () => {
  const laterToday = task({ dueDate: '2026-08-03T10:00:00.000+0000', isAllDay: false });
  assert.equal(classifyDue(laterToday, NOW, TZ), 'today');
});

test('classifyDue separates tomorrow from later and from undated', () => {
  const tomorrow = task({ dueDate: '2026-08-04T16:00:00.000+0000', isAllDay: true });
  const later = task({ dueDate: '2026-08-09T16:00:00.000+0000', isAllDay: true });

  assert.equal(classifyDue(tomorrow, NOW, TZ), 'tomorrow');
  assert.equal(classifyDue(later, NOW, TZ), 'later');
  assert.equal(classifyDue(task(), NOW, TZ), 'undated');
});

test('classifyDue calls yesterday overdue', () => {
  const yesterday = task({ dueDate: '2026-08-02T16:00:00.000+0000', isAllDay: true });
  assert.equal(classifyDue(yesterday, NOW, TZ), 'overdue');
});

test('classifyDue crosses a month boundary without drifting a day', () => {
  const julyEnd = new Date('2026-07-31T04:00:00.000Z'); // Jul 31 12:00 local
  const augustFirst = task({ dueDate: '2026-08-01T16:00:00.000+0000', isAllDay: true });
  assert.equal(classifyDue(augustFirst, julyEnd, TZ), 'tomorrow');
});

test('formatDueLabel names near days for all-day tasks and dates the far ones', () => {
  const label = (dueDate: string) =>
    formatDueLabel(task({ dueDate, isAllDay: true }), NOW, TZ);

  assert.equal(label('2026-08-03T16:00:00.000+0000'), 'Today');
  assert.equal(label('2026-08-04T16:00:00.000+0000'), 'Tomorrow');
  assert.equal(label('2026-08-02T16:00:00.000+0000'), 'Yesterday');
  assert.equal(label('2026-08-09T16:00:00.000+0000'), 'Aug 9');
});

test("formatDueLabel shows a timed task's clock time, qualified once it leaves today", () => {
  const label = (dueDate: string) =>
    formatDueLabel(task({ dueDate, isAllDay: false }), NOW, TZ);

  assert.equal(label('2026-08-03T10:00:00.000+0000'), '18:00');
  assert.equal(label('2026-08-04T06:30:00.000+0000'), 'Tomorrow 14:30');
  assert.equal(label('2026-08-09T06:30:00.000+0000'), 'Aug 9 14:30');
});

test('formatDueLabel is null for an undated task', () => {
  assert.equal(formatDueLabel(task(), NOW, TZ), null);
});

test('isOpenTask accepts only tasks that are neither done nor deleted', () => {
  assert.ok(isOpenTask(task({ status: 0 })));
  assert.ok(!isOpenTask(task({ status: 2 })));
  assert.ok(!isOpenTask(task({ status: 0, deleted: 1 })));
});

test('toPanelTask resolves the list from the project id', () => {
  const map = new Map<string, TaskListKey>([['p1', 'work']]);
  const panel = toPanelTask(task({ projectId: 'p1', priority: 5 }), map, NOW, TZ);

  assert.equal(panel.list, 'work');
  assert.equal(panel.priority, 5);
});

test('toPanelTask leaves the list null for a project the account no longer maps', () => {
  const panel = toPanelTask(task({ projectId: 'gone' }), new Map(), NOW, TZ);
  assert.equal(panel.list, null);
});

test('toPanelTask gives an untitled task a visible placeholder', () => {
  const panel = toPanelTask(task({ title: '   ' }), new Map(), NOW, TZ);
  assert.equal(panel.title, '(untitled)');
});

function panel(overrides: Partial<PanelTask>): PanelTask {
  return {
    id: 'x',
    title: 't',
    projectId: null,
    list: null,
    priority: 0,
    group: 'today',
    dueLabel: null,
    dueAt: null,
    ...overrides,
  };
}

test('sortPanelTasks orders overdue before today before undated', () => {
  const sorted = sortPanelTasks([
    panel({ id: 'c', group: 'undated' }),
    panel({ id: 'a', group: 'today' }),
    panel({ id: 'b', group: 'overdue' }),
  ]);

  assert.deepEqual(sorted.map((t) => t.id), ['b', 'a', 'c']);
});

test('sortPanelTasks puts the sooner due task first inside a group', () => {
  const sorted = sortPanelTasks([
    panel({ id: 'late', group: 'today', dueAt: 2000 }),
    panel({ id: 'soon', group: 'today', dueAt: 1000 }),
  ]);

  assert.deepEqual(sorted.map((t) => t.id), ['soon', 'late']);
});

test('sortPanelTasks falls back to priority when two tasks are due at the same moment', () => {
  const sorted = sortPanelTasks([
    panel({ id: 'low', group: 'today', dueAt: 1000, priority: 1 }),
    panel({ id: 'high', group: 'today', dueAt: 1000, priority: 5 }),
  ]);

  assert.deepEqual(sorted.map((t) => t.id), ['high', 'low']);
});

test('sortPanelTasks breaks ties on id, so repeated fetches never reshuffle rows', () => {
  const input = [
    panel({ id: 'b', group: 'undated', priority: 3 }),
    panel({ id: 'a', group: 'undated', priority: 3 }),
  ];

  assert.deepEqual(sortPanelTasks(input).map((t) => t.id), ['a', 'b']);
  assert.deepEqual(sortPanelTasks(input.slice().reverse()).map((t) => t.id), ['a', 'b']);
});

test('sortPanelTasks does not mutate its input', () => {
  const input = [panel({ id: 'b', group: 'undated' }), panel({ id: 'a', group: 'overdue' })];
  sortPanelTasks(input);
  assert.deepEqual(input.map((t) => t.id), ['b', 'a']);
});

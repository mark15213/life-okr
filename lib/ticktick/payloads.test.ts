import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  buildClosePayload,
  buildFocusSessionPayload,
  buildNewTaskPayload,
  newObjectId,
  toTickTickTime,
} from './payloads';

test('newObjectId mints a 24-hex id, the shape TickTick accepts from clients', () => {
  assert.match(newObjectId(), /^[0-9a-f]{24}$/);
});

test('newObjectId does not repeat itself', () => {
  const ids = new Set(Array.from({ length: 200 }, () => newObjectId()));
  assert.equal(ids.size, 200);
});

test('toTickTickTime writes the +0000 offset TickTick uses instead of Z', () => {
  assert.equal(toTickTickTime(new Date('2026-08-03T04:00:00.000Z')), '2026-08-03T04:00:00.000+0000');
});

test('toTickTickTime floors to the second, so due times do not render ragged', () => {
  assert.equal(toTickTickTime(new Date('2026-08-03T04:00:00.481Z')), '2026-08-03T04:00:00.000+0000');
});

test('a captured task is highest priority and open', () => {
  const payload = buildNewTaskPayload({
    id: 'abc',
    title: 'Rewrite the sync window',
    projectId: 'p1',
    due: new Date('2026-08-03T04:00:00.000Z'),
    timeZone: 'Asia/Shanghai',
  });

  assert.equal(payload.priority, 5);
  assert.equal(payload.status, 0);
  assert.equal(payload.title, 'Rewrite the sync window');
  assert.equal(payload.projectId, 'p1');
});

test('a captured task is due at a concrete moment, not all day', () => {
  const payload = buildNewTaskPayload({
    id: 'abc',
    title: 'x',
    projectId: 'p1',
    due: new Date('2026-08-03T04:00:00.000Z'),
    timeZone: 'Asia/Shanghai',
  });

  assert.equal(payload.isAllDay, false);
  assert.equal(payload.dueDate, '2026-08-03T04:00:00.000+0000');
  // A point in time, not a range — TickTick expresses that as start === due.
  assert.equal(payload.startDate, payload.dueDate);
  assert.equal(payload.timeZone, 'Asia/Shanghai');
});

test('closing a task preserves every field it was read with', () => {
  // The batch endpoint replaces rather than patches: anything dropped here is erased
  // from the user's task.
  const stored = {
    id: 'a1',
    title: 'Renew the lease',
    content: 'call the agent first',
    projectId: 'p1',
    priority: 5,
    status: 0,
    tags: ['home'],
    reminders: [{ id: 'r1' }],
  };

  const payload = buildClosePayload(stored, 'complete', new Date('2026-08-03T04:00:00.000Z'));

  assert.equal(payload.content, 'call the agent first');
  assert.deepEqual(payload.tags, ['home']);
  assert.deepEqual(payload.reminders, [{ id: 'r1' }]);
  assert.equal(payload.title, 'Renew the lease');
});

test('completing a task marks it done and stamps when', () => {
  const payload = buildClosePayload(
    { id: 'a1', status: 0 },
    'complete',
    new Date('2026-08-03T04:00:00.000Z')
  );

  assert.equal(payload.status, 2);
  assert.equal(payload.completedTime, '2026-08-03T04:00:00.000+0000');
});

test("a won't-do task is closed as abandoned, never as done", () => {
  // -1 is TickTick's "Abandoned". It matters that this is not 2: the completed-tasks
  // endpoint hands abandoned tasks back mixed in with real completions, and the dashboard
  // only keeps them out of its counts by filtering on status === 2. Writing 2 here would
  // score every abandoned task as work done.
  const payload = buildClosePayload(
    { id: 'a1', status: 0 },
    'wont-do',
    new Date('2026-08-03T04:00:00.000Z')
  );

  assert.equal(payload.status, -1);
  // Abandoned tasks carry a completedTime too — it is the closing stamp, not a claim of
  // achievement, and TickTick's own clients set it.
  assert.equal(payload.completedTime, '2026-08-03T04:00:00.000+0000');
});

test('closing a task leaves the object it was given alone', () => {
  const stored = { id: 'a1', status: 0 };
  buildClosePayload(stored, 'wont-do', new Date());
  assert.equal(stored.status, 0);
});

test('a focus session carries the task it was spent on', () => {
  const payload = buildFocusSessionPayload({
    id: 'f1',
    taskId: 'a1',
    title: 'Renew the lease',
    projectName: 'Life',
    startedAt: new Date('2026-08-03T04:00:00.000Z'),
    endedAt: new Date('2026-08-03T04:25:00.000Z'),
    pausedSeconds: 0,
  });

  assert.equal(payload.startTime, '2026-08-03T04:00:00.000+0000');
  assert.equal(payload.endTime, '2026-08-03T04:25:00.000+0000');
  assert.deepEqual(payload.tasks, [
    {
      taskId: 'a1',
      title: 'Renew the lease',
      // Sessions expose only a list *name*, never a projectId — this is the single field
      // the sync categorizes focus minutes by.
      projectName: 'Life',
      startTime: '2026-08-03T04:00:00.000+0000',
      endTime: '2026-08-03T04:25:00.000+0000',
    },
  ]);
});

test('a focus session with no task attached still uploads, with an empty task list', () => {
  const payload = buildFocusSessionPayload({
    id: 'f1',
    taskId: null,
    title: '',
    projectName: null,
    startedAt: new Date('2026-08-03T04:00:00.000Z'),
    endedAt: new Date('2026-08-03T04:25:00.000Z'),
    pausedSeconds: 0,
  });

  assert.deepEqual(payload.tasks, []);
});

test('a paused session reports the paused seconds, so the sync can net them out', () => {
  // The sync reads effective focus as (end - start) - pauseDuration. A session that ran
  // 25 wall-clock minutes with 5 paused is 20 minutes of focus; reporting 0 would credit
  // the full 25.
  const payload = buildFocusSessionPayload({
    id: 'f1',
    taskId: 'a1',
    title: 'Renew the lease',
    projectName: 'Life',
    startedAt: new Date('2026-08-03T04:00:00.000Z'),
    endedAt: new Date('2026-08-03T04:25:00.000Z'),
    pausedSeconds: 300,
  });

  assert.equal(payload.pauseDuration, 300);

  const wallClockSeconds =
    (Date.parse(payload.endTime as string) - Date.parse(payload.startTime as string)) / 1000;
  assert.equal(wallClockSeconds - (payload.pauseDuration as number), 20 * 60);
});

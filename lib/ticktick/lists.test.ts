import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  CAPTURE_LIST_KEYS,
  TASK_LISTS,
  TASK_LIST_KEYS,
  buildListKeyByProjectId,
  buildProjectIdByListKey,
  isTaskListKey,
} from './lists';

test('every list has its own colour, so a dot identifies the list unambiguously', () => {
  const colors = TASK_LIST_KEYS.map((key) => TASK_LISTS[key].color);
  assert.equal(new Set(colors).size, colors.length, `duplicate colour in ${colors.join(', ')}`);
});

test('list colours are literal hex, not Tailwind classes that lib/ cannot ship', () => {
  for (const key of TASK_LIST_KEYS) {
    assert.match(TASK_LISTS[key].color, /^#[0-9a-f]{6}$/, `${key} colour`);
  }
});

test('capture lists carry the hex the analytics chart already plots them with', () => {
  // These are the values in CategoryBreakdown's CATEGORIES table. The panel and the chart
  // describe the same four buckets, so a category must not change colour between them.
  assert.equal(TASK_LISTS.work.color, '#7c3aed');
  assert.equal(TASK_LISTS.study.color, '#0891b2');
  assert.equal(TASK_LISTS.hustle.color, '#d97706');
  assert.equal(TASK_LISTS.life.color, '#e11d48');
});

test('inbox is readable but never a capture target', () => {
  assert.ok(TASK_LIST_KEYS.includes('inbox'));
  assert.ok(!(CAPTURE_LIST_KEYS as readonly string[]).includes('inbox'));
});

test('isTaskListKey rejects anything that is not a known list', () => {
  assert.ok(isTaskListKey('work'));
  assert.ok(isTaskListKey('inbox'));
  assert.ok(!isTaskListKey('Work'));
  assert.ok(!isTaskListKey('errands'));
  assert.ok(!isTaskListKey(undefined));
  assert.ok(!isTaskListKey(42));
});

test('buildListKeyByProjectId matches list names case-insensitively', () => {
  const map = buildListKeyByProjectId(
    [
      { id: 'p1', name: 'Work' },
      { id: 'p2', name: 'study' },
      { id: 'p3', name: '  HUSTLE  ' },
    ],
    null
  );

  assert.equal(map.get('p1'), 'work');
  assert.equal(map.get('p2'), 'study');
  assert.equal(map.get('p3'), 'hustle');
});

test('buildListKeyByProjectId ignores lists that are not one of ours', () => {
  const map = buildListKeyByProjectId([{ id: 'p1', name: 'Groceries' }], null);
  assert.equal(map.size, 0);
});

test('buildListKeyByProjectId keys the inbox off its id, never its localized name', () => {
  // The same account has returned both "Inbox" and "收集箱" for this list, so the name is
  // not a usable key — only inboxId is.
  const map = buildListKeyByProjectId([{ id: 'p1', name: '收集箱' }], 'inbox123');

  assert.equal(map.get('inbox123'), 'inbox');
  assert.equal(map.get('p1'), undefined);
});

test('buildListKeyByProjectId skips archived lists so an old "Work" cannot shadow the live one', () => {
  const map = buildListKeyByProjectId(
    [
      { id: 'old', name: 'Work', closed: true },
      { id: 'live', name: 'Work' },
    ],
    null
  );

  assert.equal(map.get('old'), undefined);
  assert.equal(map.get('live'), 'work');
});

test('buildProjectIdByListKey inverts the map and keeps the first id per list', () => {
  const map = buildProjectIdByListKey(
    [
      { id: 'first', name: 'Work' },
      { id: 'second', name: 'work' },
    ],
    'inbox123'
  );

  assert.equal(map.get('work'), 'first');
  assert.equal(map.get('inbox'), 'inbox123');
});

test('buildProjectIdByListKey has no entry for a list the account does not have', () => {
  const map = buildProjectIdByListKey([{ id: 'p1', name: 'Work' }], null);
  assert.equal(map.get('hustle'), undefined);
});

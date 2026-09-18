import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { applyQueueOrder } from './task-groups';

const task = (id: string) => ({ id });

test('applyQueueOrder sorts by the shared order', () => {
  const sorted = applyQueueOrder([task('a'), task('b'), task('c')], ['c', 'a', 'b']);
  assert.deepEqual(sorted.map((t) => t.id), ['c', 'a', 'b']);
});

test('applyQueueOrder puts unknown ids at the front in their incoming order', () => {
  const sorted = applyQueueOrder([task('new1'), task('b'), task('new2'), task('a')], ['a', 'b']);
  assert.deepEqual(sorted.map((t) => t.id), ['new1', 'new2', 'a', 'b']);
});

test('applyQueueOrder ignores ids the order still lists but the panel no longer has', () => {
  const sorted = applyQueueOrder([task('b'), task('a')], ['gone', 'a', 'also-gone', 'b']);
  assert.deepEqual(sorted.map((t) => t.id), ['a', 'b']);
});

test('applyQueueOrder is a no-op without a stored order', () => {
  const incoming = [task('a'), task('b')];
  assert.deepEqual(applyQueueOrder(incoming, null).map((t) => t.id), ['a', 'b']);
  assert.deepEqual(applyQueueOrder(incoming, []).map((t) => t.id), ['a', 'b']);
});

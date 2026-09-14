import test from 'node:test';
import assert from 'node:assert/strict';
import { FocusEngine, emptyState, restoreState, totals, statistics } from '../engine.mjs';
import storage from '../storage.cjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function setup(wallStart = Date.parse('2026-09-13T08:00:00+08:00')) {
  let mono = 0, wall = wallStart;
  const engine = new FocusEngine(emptyState(), () => mono, () => wall);
  const tasks = ['Project A','Project B','Project C'].map(t => engine.addTask(t));
  return { engine, tasks, advance(ms) { mono += ms; wall += ms; }, wallJump(ms) { wall += ms; } };
}

test('30-minute global round allocates A/B/C ten minutes each and completes exactly once', () => {
  const {engine:e,tasks,advance} = setup();
  e.select(tasks[0].id); e.start(); const id = e.state.current.id;
  advance(600000); e.select(tasks[1].id);
  assert.equal(e.state.current.id,id); assert.equal(e.state.current.elapsedMs,600000);
  advance(600000); e.select(tasks[2].id);
  advance(600000); const done = e.tick();
  assert.equal(done.id,id); assert.equal(e.state.history.length,1);
  assert.deepEqual(totals(done).map(t=>t.durationMs),[600000,600000,600000]);
  assert.equal(e.tick(),null); assert.equal(e.state.current,null);
});
test('A/B/A shares a single countdown and adds disjoint A fragments', () => {
  const {engine:e,tasks,advance} = setup();
  e.select(tasks[0].id); e.start();
  advance(480000); e.select(tasks[1].id);
  advance(300000); e.select(tasks[0].id);
  assert.equal(e.state.current.durationMs-e.state.current.elapsedMs,1020000);
  advance(20000); e.tick();
  assert.deepEqual(totals(e.state.current).map(t=>t.durationMs),[500000,300000]);
  assert.equal(e.state.current.segments.length,3);
});
test('pause and task switch during pause preserve remaining time until explicit resume', () => {
  const {engine:e,tasks,advance} = setup();
  e.select(tasks[0].id); e.start(); advance(720000); e.pause();
  e.select(tasks[1].id); advance(300000); e.tick();
  assert.equal(e.state.current.elapsedMs,720000); assert.equal(e.state.current.status,'paused');
  assert.equal(totals(e.state.current).length,1);
  e.resume(); advance(20000); e.tick();
  assert.equal(totals(e.state.current)[1].durationMs,20000);
});
test('short segments survive switching, repeated selection does not fragment', () => {
  const {engine:e,tasks,advance} = setup();
  e.select(tasks[0].id); e.start(); advance(20000); e.select(tasks[0].id);
  e.select(tasks[1].id); advance(20000); e.finish();
  assert.deepEqual(totals(e.state.history[0]).map(t=>t.durationMs),[20000,20000]);
  assert.equal(e.state.history[0].segments.length,2);
  assert.equal(e.state.history[0].status,'ended');
});
test('monotonic countdown is independent from system wall-clock changes and caps overtime', () => {
  const {engine:e,tasks,advance,wallJump} = setup();
  e.select(tasks[0].id); e.start(); advance(10000); e.tick();
  wallJump(-3600000); advance(10000); e.tick();
  assert.equal(e.state.current.elapsedMs,20000);
  advance(7200000); e.tick();
  assert.equal(e.state.history[0].elapsedMs,1800000);
});
test('restarting restores paused state without crediting downtime', () => {
  const {engine:e,tasks,advance} = setup();
  e.select(tasks[0].id); e.start(); advance(17000); e.tick();
  const restored = restoreState(JSON.parse(JSON.stringify(e.state)));
  const next = new FocusEngine(restored,()=>9000000,()=>Date.now());
  next.tick(); assert.equal(next.state.current.status,'paused');
  assert.equal(next.state.current.elapsedMs,17000);
  assert.equal(next.state.current.segments[0].open,false);
});
test('midnight accounting divides a single segment between Shanghai calendar dates', () => {
  const {engine:e,tasks,advance} = setup(Date.parse('2026-09-13T23:55:00+08:00'));
  e.select(tasks[0].id); e.start(); advance(600000); e.finish();
  const yesterday = statistics(e.state,Date.parse('2026-09-13T12:00:00+08:00'));
  const today = statistics(e.state,Date.parse('2026-09-14T12:00:00+08:00'));
  assert.equal(yesterday[tasks[0].id].today,300000);
  assert.equal(today[tasks[0].id].today,300000);
  assert.equal(today[tasks[0].id].total,600000);
});
test('removing active remote task pauses round and keeps historical name and duration', () => {
  const {engine:e,advance} = setup();
  e.syncTasks([{id:'123',title:'Remote A',list:'work'}]);
  e.select('ticktick:123'); e.start(); advance(20000);
  assert.equal(e.syncTasks([]),true);
  assert.equal(e.state.current.status,'paused'); assert.equal(e.state.selectedId,null);
  assert.equal(totals(e.state.current)[0].title,'Remote A');
  assert.equal(totals(e.state.current)[0].durationMs,20000);
});
test('previous shortcut alternates MRU tasks without resetting the round', () => {
  const {engine:e,tasks,advance} = setup();
  e.select(tasks[0].id); e.start(); advance(20000); e.select(tasks[1].id);
  e.previous(); assert.equal(e.state.selectedId,tasks[0].id);
  e.previous(); assert.equal(e.state.selectedId,tasks[1].id);
  assert.equal(e.state.current.elapsedMs,20000);
});
test('corrupted record is preserved, and valid state is atomically round-tripped', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'hustle-storage-'));
  try {
    const file = path.join(dir,'state.json');
    const {engine:e,tasks,advance} = setup();
    e.select(tasks[0].id); e.start(); advance(20000); e.tick();
    storage.save(file,e.state);
    const loaded = storage.read(file,restoreState,emptyState);
    assert.equal(loaded.state.current.elapsedMs,20000); assert.equal(loaded.recovered,true);
    fs.writeFileSync(file,'{bad json');
    const damaged = storage.read(file,restoreState,emptyState);
    assert.ok(damaged.error); assert.ok(fs.readdirSync(dir).some(n=>n.includes('.damaged-')));
    const raw = JSON.parse(JSON.stringify(e.state)); raw.current.elapsedMs += 100;
    assert.throws(()=>restoreState(raw),/校验/);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

// addTask unshifts, so the queue order after setup is C, B, A.
test('queue is always the top of the priority order minus the current task', () => {
  const {engine:e,tasks} = setup();
  const [a,b,c] = tasks;
  assert.deepEqual(e.queue().map(t=>t.id),[c.id,b.id,a.id]);
  e.select(b.id);
  assert.deepEqual(e.queue().map(t=>t.id),[c.id,a.id]);
  e.next(); assert.equal(e.state.selectedId,c.id);
  assert.deepEqual(e.queue().map(t=>t.id),[b.id,a.id]);
  e.move(a.id,0);
  assert.deepEqual(e.queue().map(t=>t.id),[a.id,b.id]);
  e.next(); assert.equal(e.state.selectedId,a.id);
});
test('move reorders the queue and sync keeps the order the user chose', () => {
  const {engine:e,tasks} = setup();
  const [a,b,c] = tasks;
  e.move(a.id,0);
  assert.deepEqual(e.state.tasks.map(t=>t.id),[a.id,c.id,b.id]);
  e.syncTasks([{id:'r1',title:'Remote 1',list:'work'},{id:'r2',title:'Remote 2',list:'life'}]);
  e.move('ticktick:r2',1);
  assert.deepEqual(e.state.tasks.map(t=>t.id),[a.id,'ticktick:r2',c.id,b.id,'ticktick:r1']);
  e.syncTasks([{id:'r2',title:'Remote 2 renamed',list:'life'},{id:'r3',title:'Remote 3',list:'study'}]);
  assert.deepEqual(e.state.tasks.map(t=>t.id),[a.id,'ticktick:r2',c.id,b.id,'ticktick:r3']);
  assert.equal(e.task('ticktick:r2').title,'Remote 2 renamed');
  assert.throws(()=>e.move('nope',0),/不可用/);
});
test('completing the current task hands a running round to the next queued task', () => {
  const {engine:e,tasks,advance} = setup();
  const [a,b,c] = tasks;
  e.select(c.id); e.start(); advance(60000);
  const done = e.complete();
  assert.equal(done.id,c.id);
  assert.equal(e.state.selectedId,b.id);
  assert.equal(e.state.current.status,'running');
  advance(60000); e.tick();
  assert.deepEqual(totals(e.state.current).map(t=>[t.title,t.durationMs]),[['Project C',60000],['Project B',60000]]);
  e.complete(a.id);
  assert.equal(e.state.selectedId,b.id);
  e.complete();
  assert.equal(e.state.selectedId,null);
  assert.equal(e.state.current.status,'paused');
  assert.throws(()=>e.complete(),/先选择/);
});
test('addTask takes a category and rejects unknown ones', () => {
  const {engine:e} = setup();
  assert.equal(e.addTask('Read','study').list,'study');
  assert.throws(()=>e.addTask('Read','nope'),/分类/);
});

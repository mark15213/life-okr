import { randomUUID } from 'node:crypto';

export const DEFAULT_SHORTCUTS = {
  switch: 'Control+Alt+K', previous: 'Control+Alt+J', pause: 'Control+Alt+P',
};

export function emptyState() {
  return { version: 1, tasks: [], current: null, history: [], selectedId: null,
    recent: [], settings: { minutes: 30, topmost: true, locked: false,
      sound: true, server: '', shortcuts: { ...DEFAULT_SHORTCUTS } } };
}

// Monotonic time controls duration. Wall time is metadata, never a countdown source.
export class FocusEngine {
  constructor(state = emptyState(), clock = () => performance.now(), wall = () => Date.now()) {
    this.state = state;
    this.clock = clock;
    this.wall = wall;
    this.anchor = clock();
    if (state.current?.status === 'running') state.current.status = 'paused';
  }
  task(id = this.state.selectedId) { return this.state.tasks.find(t => t.id === id); }
  tick() {
    const now = this.clock();
    const round = this.state.current;
    if (round?.status === 'running') {
      const delta = Math.min(Math.max(0, now - this.anchor), round.durationMs - round.elapsedMs);
      if (delta > 0) {
        const last = round.segments.at(-1);
        const task = this.task();
        if (!task) { round.status = 'paused'; this.anchor = now; return null; }
        if (last && last.open && last.taskId === task.id) {
          last.durationMs += delta;
          last.endedAt = last.startedAt + last.durationMs;
        } else {
          round.segments.push({ id: randomUUID(), taskId: task.id, title: task.title,
            list: task.list, startedAt: this.wall() - delta, endedAt: this.wall(), durationMs: delta, open: true });
        }
        round.elapsedMs += delta;
      }
      if (round.elapsedMs >= round.durationMs) {
        this.anchor = now;
        return this.end('completed');
      }
    }
    this.anchor = now;
    return null;
  }
  closeSegment() {
    const last = this.state.current?.segments.at(-1);
    if (last) last.open = false;
  }
  select(id) {
    this.tick();
    if (!this.task(id)) throw new Error('任务已不可用，请刷新任务列表');
    if (id === this.state.selectedId) return;
    this.closeSegment();
    this.state.selectedId = id;
    this.state.recent = [id, ...this.state.recent.filter(t => t !== id)].slice(0, 100);
  }
  previous() {
    const id = this.state.recent.find(id => id !== this.state.selectedId && this.task(id));
    if (id) this.select(id);
  }
  start(minutes = this.state.settings.minutes) {
    if (this.state.current) throw new Error('请先结束当前番茄');
    if (!this.task()) throw new Error('先选择一个任务');
    if (![15, 25, 30, 45, 60].includes(minutes)) throw new Error('无效时长');
    this.state.current = { id: randomUUID(), durationMs: minutes * 60000,
      elapsedMs: 0, status: 'running', startedAt: this.wall(), segments: [] };
    this.anchor = this.clock();
  }
  pause() {
    this.tick();
    if (this.state.current) this.state.current.status = 'paused';
    this.closeSegment();
  }
  resume() {
    if (!this.task()) throw new Error('先选择一个有效任务');
    if (!this.state.current) return this.start();
    this.state.current.status = 'running';
    this.anchor = this.clock();
  }
  toggle() {
    if (this.state.current?.status === 'running') this.pause(); else this.resume();
  }
  end(reason = 'ended') {
    const round = this.state.current;
    if (!round) return null;
    this.closeSegment();
    round.status = reason;
    round.endedAt = reason === 'completed' ? (round.segments.at(-1)?.endedAt ?? this.wall()) : this.wall();
    this.state.history.unshift(round);
    this.state.current = null;
    if (reason === 'completed') this.completed = round;
    return round;
  }
  finish() { this.tick(); return this.end(); }
  addTask(title) {
    title = typeof title === 'string' ? title.trim().slice(0, 200) : '';
    if (!title) throw new Error('请输入任务名称');
    const task = { id: `local:${randomUUID()}`, title, list: 'work', source: 'local' };
    this.state.tasks.unshift(task);
    return task;
  }
  syncTasks(tasks, sourceKey = '') {
    if (!Array.isArray(tasks) || tasks.some(t => !t || typeof t.id !== 'string' || !t.id || typeof t.title !== 'string')) {
      throw new Error('服务器任务数据无效');
    }
    this.tick();
    if (new Set(tasks.map(t => t.id)).size !== tasks.length) throw new Error('服务器任务标识重复');
    const incoming = tasks.map(t => ({ id: `ticktick:${sourceKey ? `${encodeURIComponent(sourceKey)}:` : ''}${t.id}`, externalId: t.id,
      title: t.title.slice(0, 500), list: t.list ?? 'inbox', source: 'ticktick' }));
    const removed = this.state.selectedId?.startsWith('ticktick:') && !incoming.some(t => t.id === this.state.selectedId);
    if (removed) this.pause();
    this.state.tasks = [...this.state.tasks.filter(t => t.source === 'local'), ...incoming];
    if (removed) this.state.selectedId = null;
    this.state.syncedAt = this.wall();
    return removed;
  }
}

export function totals(round) {
  const map = new Map();
  for (const s of round?.segments ?? []) {
    const row = map.get(s.taskId) ?? { taskId: s.taskId, title: s.title, list: s.list, durationMs: 0 };
    row.durationMs += s.durationMs;
    map.set(s.taskId, row);
  }
  return [...map.values()];
}

export function statistics(state, now = Date.now()) {
  // Fixed Asia/Shanghai day boundary, matching the PRD; split crossing-midnight segments.
  const offset = 8 * 3600000;
  const dayStart = Math.floor((now + offset) / 86400000) * 86400000 - offset;
  const map = {};
  for (const round of [...state.history, ...(state.current ? [state.current] : [])]) {
    for (const segment of round.segments) {
      const row = map[segment.taskId] ??= { total: 0, today: 0 };
      row.total += segment.durationMs;
      row.today += Math.max(0, Math.min(segment.startedAt + segment.durationMs, dayStart + 86400000) - Math.max(segment.startedAt, dayStart));
    }
  }
  return map;
}

export function restoreState(raw) {
  if (!raw || raw.version !== 1 || !Array.isArray(raw.tasks) || !Array.isArray(raw.history)) throw new Error('本地数据格式无效');
  const ids = new Set();
  for (const task of raw.tasks) {
    if (!task || typeof task.id !== 'string' || !task.id || ids.has(task.id) || typeof task.title !== 'string' || !['local', 'ticktick'].includes(task.source)) throw new Error('本地任务数据无效');
    ids.add(task.id);
  }
  const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  for (const round of [...raw.history, ...(raw.current ? [raw.current] : [])]) {
    if (!round || typeof round.id !== 'string' || !finite(round.durationMs) || !finite(round.elapsedMs) || round.elapsedMs > round.durationMs || !Array.isArray(round.segments) || !['running','paused','completed','ended'].includes(round.status)) throw new Error('本地计时数据无效');
    let sum = 0;
    for (const s of round.segments) {
      if (!s || typeof s.taskId !== 'string' || typeof s.title !== 'string' || !finite(s.durationMs) || !finite(s.startedAt)) throw new Error('本地专注片段无效');
      sum += s.durationMs;
      s.open = false;
    }
    if (Math.abs(sum - round.elapsedMs) > 0.01) throw new Error('本地时长校验失败');
  }
  const defaults = emptyState();
  raw.settings = { ...defaults.settings, ...raw.settings, shortcuts: { ...DEFAULT_SHORTCUTS, ...raw.settings?.shortcuts } };
  if (![15,25,30,45,60].includes(raw.settings.minutes)) raw.settings.minutes = 30;
  raw.recent = Array.isArray(raw.recent) ? raw.recent.filter(id => ids.has(id)) : [];
  if (!ids.has(raw.selectedId)) raw.selectedId = null;
  if (raw.current) raw.current.status = 'paused';
  return raw;
}

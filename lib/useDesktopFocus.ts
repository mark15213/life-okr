'use client';

import { useEffect, useState } from 'react';
import type { PomodoroSession } from './ticktick/pomodoro';
import type { TaskListKey } from './ticktick/lists';

export interface DesktopSnapshot {
  current: { id: string; durationMs: number; elapsedMs: number; status: string; startedAt: number } | null;
  selectedId: string | null;
  tasks: { id: string; externalId?: string; title: string; list: TaskListKey | null }[];
  settings: { server: string; minutes: number; shortcuts: { switch: string } };
  platform: string;
}

export interface DesktopBridge {
  get(): Promise<DesktopSnapshot>;
  request(input: { path: string; method: string; body?: string }): Promise<{ status: number; body: string }>;
  focusTask(id: string): Promise<DesktopSnapshot>;
  command(type: string, value?: unknown): Promise<DesktopSnapshot>;
  settings(value: Record<string, unknown>): Promise<DesktopSnapshot>;
  open(): Promise<void>;
  dashboard(): Promise<void>;
  onState(callback: (state: DesktopSnapshot) => void): () => void;
  onRefresh(callback: () => void): () => void;
}

declare global { interface Window { hustle?: DesktopBridge } }

export function useDesktopFocus() {
  const bridge = typeof window !== 'undefined' && window.hustle?.request ? window.hustle : null;
  const [state, setState] = useState<DesktopSnapshot | null>(null);
  useEffect(() => {
    if (!bridge) return;
    let active = true;
    const update = (value: DesktopSnapshot) => { if (active) setState(value); };
    const unsubscribe = bridge.onState(update);
    void bridge.get().then(update).catch(() => {});
    return () => { active = false; unsubscribe(); };
  }, [bridge]);
  const round = state?.current;
  const task = state?.tasks.find(t => t.id === state.selectedId);
  const now = (round?.startedAt ?? 0) + (round?.elapsedMs ?? 0);
  const session: PomodoroSession | null = round ? {
    sessionId: round.id, taskId: task?.externalId ?? task?.id ?? '',
    title: task?.title ?? '选择任务后继续', list: task?.list ?? null,
    durationMin: round.durationMs / 60000,
    startedAt: now - round.elapsedMs, pausedAt: round.status === 'paused' ? now : null, pausedMs: 0,
  } : null;
  return { bridge, enabled: Boolean(bridge), session, minutes: state?.settings.minutes,
    remaining: round ? round.durationMs - round.elapsedMs : 0 };
}

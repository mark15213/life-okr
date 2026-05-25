import type { LocalDayRange } from './ticktick-date';

export interface TickTickTask {
  status: number;
  completedTime: string | null;
}

export interface TickTickPomodoro {
  startTime: string;
  endTime: string;
  pauseDuration?: number; // seconds paused mid-session
}

export function countCompletedTasksToday(tasks: TickTickTask[], range: LocalDayRange): number {
  let count = 0;
  for (const t of tasks) {
    if (t.status !== 2) continue;
    if (!t.completedTime) continue;
    const ms = new Date(t.completedTime).getTime();
    if (Number.isNaN(ms)) continue;
    if (ms >= range.startMs && ms < range.endMs) count++;
  }
  return count;
}

export function sumFocusMinutesToday(pomodoros: TickTickPomodoro[], range: LocalDayRange): number {
  let totalSeconds = 0;
  for (const p of pomodoros) {
    const startMs = new Date(p.startTime).getTime();
    const endMs = new Date(p.endTime).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) continue;
    if (startMs < range.startMs || startMs >= range.endMs) continue;
    const elapsedSec = Math.max(0, Math.round((endMs - startMs) / 1000) - (p.pauseDuration ?? 0));
    totalSeconds += elapsedSec;
  }
  return Math.round(totalSeconds / 60);
}

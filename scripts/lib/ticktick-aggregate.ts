import type { LocalDayRange } from './ticktick-date';

export interface TickTickTask {
  status: number;
  completedTime: string | null;
}

export interface TickTickPomodoro {
  startTime: string;
  duration: number; // seconds
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
    const ms = new Date(p.startTime).getTime();
    if (Number.isNaN(ms)) continue;
    if (ms >= range.startMs && ms < range.endMs) {
      totalSeconds += p.duration;
    }
  }
  return Math.round(totalSeconds / 60);
}

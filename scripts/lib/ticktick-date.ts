export interface LocalDayRange {
  startMs: number;
  endMs: number;
}

export function getLocalDayRange(now: Date): LocalDayRange {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const startMs = start.getTime();
  const endMs = startMs + 24 * 60 * 60 * 1000;
  return { startMs, endMs };
}

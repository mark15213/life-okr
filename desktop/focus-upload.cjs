const { createHash } = require('node:crypto');

// One entry per task and Shanghai date, with stable IDs across retries.
// Only rounds started by this version opt in; existing local history is untouched.
function focusUploads(round) {
  if (!round.cloudServer) return [];
  const prefix = `ticktick:${encodeURIComponent(round.cloudServer)}:`;
  const groups = new Map();
  for (const segment of round.segments) {
    if (!segment.taskId.startsWith(prefix)) continue;
    let start = segment.startedAt, left = segment.durationMs;
    while (left > 0) {
      const day = Math.floor((start + 28800000) / 86400000);
      const duration = Math.min(left, (day + 1) * 86400000 - 28800000 - start);
      const key = `${segment.taskId}:${day}`;
      const row = groups.get(key) || { taskId: segment.taskId.slice(prefix.length), title: segment.title,
        startedAt: start, endedAt: start, durationMs: 0 };
      row.endedAt = Math.max(row.endedAt, start + duration);
      row.durationMs += duration;
      groups.set(key, row);
      start += duration; left -= duration;
    }
  }
  return [...groups].filter(([, row]) => row.durationMs >= 60000).map(([key, row]) => ({
    sessionId: createHash('sha256').update(`${round.id}:${key}`).digest('hex').slice(0, 24),
    taskId: row.taskId, title: row.title, startedAt: row.startedAt, endedAt: row.endedAt,
    pausedSeconds: Math.max(0, (row.endedAt - row.startedAt - row.durationMs) / 1000),
  }));
}

module.exports = { focusUploads };

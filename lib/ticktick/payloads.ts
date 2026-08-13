import { randomBytes } from 'node:crypto';

/**
 * TickTick ids are 24-hex ObjectIds and the client is allowed to mint them. Generating ours
 * up front makes writes idempotent: re-POSTing the same id updates that row instead of
 * creating a duplicate, so a retry after a flaky socket cannot double-add a task.
 */
export function newObjectId(): string {
  return randomBytes(12).toString('hex');
}

/**
 * TickTick's wire format for instants: ISO-8601 with a `+0000` offset instead of `Z`.
 * Milliseconds are zeroed — the API round-trips whatever precision you send, and a due time
 * of 14:03:27.481 renders as a ragged timestamp in every client.
 */
export function toTickTickTime(date: Date): string {
  const whole = new Date(Math.floor(date.getTime() / 1000) * 1000);
  return whole.toISOString().replace('Z', '+0000');
}

export interface NewTaskInput {
  id: string;
  title: string;
  projectId: string;
  /** When the task is due. The panel always passes "now" — everything captured here is urgent. */
  due: Date;
  timeZone: string;
}

/**
 * A task fixed at the panel's two invariants: highest priority (5) and a concrete due time
 * today. `startDate` and `dueDate` carry the same instant, which is how TickTick represents a
 * point-in-time task rather than a range.
 */
export function buildNewTaskPayload(input: NewTaskInput): Record<string, unknown> {
  const stamp = toTickTickTime(input.due);
  return {
    id: input.id,
    projectId: input.projectId,
    title: input.title,
    content: '',
    priority: 5,
    status: 0,
    isAllDay: false,
    startDate: stamp,
    dueDate: stamp,
    timeZone: input.timeZone,
    reminders: [],
    items: [],
    tags: [],
    kind: 'TEXT',
  };
}

/**
 * How a task stopped being open, and the `status` TickTick files it under.
 *
 * Both outcomes are "closed" tasks and both carry a `completedTime` — the status is the only
 * thing that separates a win from a write-off. Keeping them apart matters beyond the label:
 * `/project/all/completed/` returns abandoned tasks mixed in with real completions, and the
 * dashboard's counts only survive that because they filter on `status === 2`. Writing a
 * won't-do task as 2 would score it as work done.
 *
 * The keys double as the URL segment under `/api/ticktick/tasks/[id]/`, so there is one
 * spelling of each outcome rather than a wire name and a code name to keep in step.
 */
export const CLOSED_STATUS = { complete: 2, 'wont-do': -1 } as const;

export type TaskOutcome = keyof typeof CLOSED_STATUS;

/**
 * Closing is a full-object update, not a patch: the batch endpoint replaces the stored task
 * with what you send, so the caller must hand over the task exactly as it was read.
 */
export function buildClosePayload<T extends Record<string, unknown>>(
  task: T,
  outcome: TaskOutcome,
  closedAt: Date
): Record<string, unknown> {
  return { ...task, status: CLOSED_STATUS[outcome], completedTime: toTickTickTime(closedAt) };
}

export interface FocusSessionInput {
  id: string;
  taskId: string | null;
  title: string;
  /**
   * The *list name* as TickTick spells it (Work / Study / Hustle / Life). Focus sessions
   * expose only a name, never a projectId, and sync-ticktick.ts categorizes focus minutes off
   * this field — get it wrong and the minutes land in `uncategorized`.
   */
  projectName: string | null;
  startedAt: Date;
  endedAt: Date;
  /**
   * Seconds spent paused between `startedAt` and `endedAt`. Readers net this out of the
   * wall-clock span to get real focus time, so reporting 0 for a session that was paused
   * credits time that was never spent.
   */
  pausedSeconds: number;
}

/** A completed pomodoro, shaped like the ones the official clients upload. */
export function buildFocusSessionPayload(input: FocusSessionInput): Record<string, unknown> {
  const startTime = toTickTickTime(input.startedAt);
  const endTime = toTickTickTime(input.endedAt);

  return {
    id: input.id,
    tasks: input.taskId
      ? [
          {
            taskId: input.taskId,
            title: input.title,
            projectName: input.projectName,
            startTime,
            endTime,
          },
        ]
      : [],
    startTime,
    endTime,
    status: 1,
    pauseDuration: Math.max(0, Math.round(input.pausedSeconds)),
    adjustTime: 0,
    type: 0,
    added: false,
  };
}

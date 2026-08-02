/**
 * The five buckets the task panel exposes. The first four are real TickTick lists named
 * exactly Work / Study / Hustle / Life; `inbox` is the account's default list, which the
 * API localizes ("Inbox" vs "收集箱") and therefore must be keyed off `inboxId`, never off
 * its name — see buildListKeyByProjectId.
 */
export const TASK_LIST_KEYS = ['work', 'study', 'hustle', 'life', 'inbox'] as const;

export type TaskListKey = (typeof TASK_LIST_KEYS)[number];

/** Lists you can capture *into*. Inbox is readable but is never a capture target. */
export const CAPTURE_LIST_KEYS = ['work', 'study', 'hustle', 'life'] as const;

export interface TaskListMeta {
  key: TaskListKey;
  label: string;
  /**
   * The colour that identifies this list wherever it appears. A literal rather than a
   * Tailwind class on purpose: `lib/` is outside the configured content globs, so a class
   * named only here would be dropped from the stylesheet and the dot would render invisible.
   */
  color: string;
}

/**
 * One colour vocabulary for the categories across the whole app — the panel's list dots and
 * the analytics stacks are the same four buckets, so `CategoryBreakdown` imports this table
 * rather than keeping its own. A category cannot mean amber on one screen and rose on another.
 */
export const TASK_LISTS: Record<TaskListKey, TaskListMeta> = {
  work: { key: 'work', label: 'Work', color: '#7c3aed' },
  study: { key: 'study', label: 'Study', color: '#0891b2' },
  hustle: { key: 'hustle', label: 'Hustle', color: '#d97706' },
  life: { key: 'life', label: 'Life', color: '#e11d48' },
  inbox: { key: 'inbox', label: 'Inbox', color: '#64748b' },
};

export interface ProjectProfile {
  id?: string;
  name?: string;
  closed?: boolean | null;
}

export function isTaskListKey(value: unknown): value is TaskListKey {
  return typeof value === 'string' && (TASK_LIST_KEYS as readonly string[]).includes(value);
}

function namedListKey(name: string | undefined): TaskListKey | null {
  const key = (name ?? '').trim().toLowerCase();
  for (const candidate of CAPTURE_LIST_KEYS) {
    if (key === candidate) return candidate;
  }
  return null;
}

/**
 * projectId → panel list. Archived ("closed") lists are skipped so a resurrected old list
 * named "Work" cannot shadow the live one. Inbox is added last and unconditionally: its id
 * comes from the sync payload, so no name matching is involved.
 */
export function buildListKeyByProjectId(
  profiles: ProjectProfile[] | undefined,
  inboxId: string | null | undefined
): Map<string, TaskListKey> {
  const map = new Map<string, TaskListKey>();
  for (const profile of profiles ?? []) {
    if (!profile?.id || profile.closed) continue;
    const key = namedListKey(profile.name);
    if (key) map.set(profile.id, key);
  }
  if (inboxId) map.set(inboxId, 'inbox');
  return map;
}

/** The inverse: panel list → projectId, for addressing writes. */
export function buildProjectIdByListKey(
  profiles: ProjectProfile[] | undefined,
  inboxId: string | null | undefined
): Map<TaskListKey, string> {
  const map = new Map<TaskListKey, string>();
  for (const [projectId, key] of buildListKeyByProjectId(profiles, inboxId)) {
    if (!map.has(key)) map.set(key, projectId);
  }
  return map;
}

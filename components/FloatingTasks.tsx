'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { motion, AnimatePresence } from 'framer-motion';
import {
    AlertTriangle,
    Check,
    ListChecks,
    Lock,
    Pause,
    Play,
    Plus,
    RotateCcw,
    Timer,
    X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CAPTURE_LIST_KEYS, TASK_LISTS, type TaskListKey } from '@/lib/ticktick/lists';
import {
    TASK_GROUPS,
    TASK_GROUP_LABELS,
    type PanelTask,
} from '@/lib/ticktick/task-groups';
import {
    DEFAULT_FOCUS_MINUTES,
    FOCUS_DURATION_OPTIONS,
    POMODORO_DURATION_KEY,
    POMODORO_PENDING_KEY,
    POMODORO_STORAGE_KEY,
    buildPendingFocus,
    formatClock,
    isComplete,
    newBrowserSessionId,
    parseStoredPending,
    parseStoredSession,
    pauseSession,
    remainingMs,
    resolveOutcome,
    resumeSession,
    startSession,
    type PendingFocus,
    type PomodoroSession,
} from '@/lib/ticktick/pomodoro';

/**
 * Priority is a weight, not a hue.
 *
 * The four category colours are spoken for — they mean Work/Study/Hustle/Life here and in
 * the analytics stacks — so priority reads as ring darkness instead, and rose is reserved
 * for the one thing that is genuinely alarming: something is overdue.
 */
const PRIORITY_RINGS: Record<number, string> = {
    5: '#18181b',
    3: '#71717a',
    1: '#a1a1aa',
    0: '#d4d4d8',
};

const OVERDUE = '#e11d48';

type Filter = 'all' | TaskListKey;
type NoticeTone = 'error' | 'good' | 'muted';
interface Notice {
    tone: NoticeTone;
    message: string;
}

interface FloatingTasksProps {
    isAuthed: boolean;
    /** Called when a locked visitor tries to open the panel, to send them to the passcode box. */
    onRequestUnlock: () => void;
}

async function fetchTasks(url: string): Promise<{ tasks: PanelTask[] }> {
    const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Could not load tasks from TickTick');
    return body;
}

function readStored<T>(key: string, parse: (raw: unknown) => T | null): T | null {
    try {
        const raw = localStorage.getItem(key);
        return raw ? parse(JSON.parse(raw)) : null;
    } catch {
        return null;
    }
}

function writeStored(key: string, value: unknown): void {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Private mode and full quotas both land here. Losing persistence is survivable;
        // throwing during a render pass is not.
    }
}

function focusLabel(seconds: number): string {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

function ListDot({ list, className }: { list: TaskListKey | null; className?: string }) {
    return (
        <span
            className={cn('w-1.5 h-1.5 rounded-full shrink-0', className)}
            style={{ backgroundColor: list ? TASK_LISTS[list].color : '#d4d4d8' }}
        />
    );
}

export default function FloatingTasks({ isAuthed, onRequestUnlock }: FloatingTasksProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [hydrated, setHydrated] = useState(false);

    const [session, setSession] = useState<PomodoroSession | null>(null);
    const [pending, setPending] = useState<PendingFocus | null>(null);
    const [durationMin, setDurationMin] = useState<number>(DEFAULT_FOCUS_MINUTES);
    const [durationOpen, setDurationOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [now, setNow] = useState(() => Date.now());

    const [title, setTitle] = useState('');
    const [captureList, setCaptureList] = useState<TaskListKey>('work');
    const [capturing, setCapturing] = useState(false);
    const [completing, setCompleting] = useState<Set<string>>(new Set());
    const [filter, setFilter] = useState<Filter>('all');
    const [notice, setNotice] = useState<Notice | null>(null);

    const finishingRef = useRef<string | null>(null);
    const retriedRef = useRef(false);

    const { data, error, isLoading, mutate } = useSWR(
        // Reads are gated too — the cookie is a whole-account credential, so an unauthenticated
        // fetch would just 401. Not asking at all keeps the locked dashboard quiet.
        isAuthed ? '/api/ticktick/tasks' : null,
        fetchTasks
    );

    const tasks = useMemo(() => data?.tasks ?? [], [data]);

    /* ---------------------------------------------------------------- persistence */

    useEffect(() => {
        setSession(readStored(POMODORO_STORAGE_KEY, parseStoredSession));
        setPending(readStored(POMODORO_PENDING_KEY, parseStoredPending));

        const stored = Number(localStorage.getItem(POMODORO_DURATION_KEY));
        if ((FOCUS_DURATION_OPTIONS as readonly number[]).includes(stored)) setDurationMin(stored);

        setHydrated(true);
    }, []);

    useEffect(() => {
        if (hydrated) writeStored(POMODORO_STORAGE_KEY, session);
    }, [hydrated, session]);

    useEffect(() => {
        if (hydrated) writeStored(POMODORO_PENDING_KEY, pending);
    }, [hydrated, pending]);

    /* ---------------------------------------------------------------------- clock */

    useEffect(() => {
        if (!session || session.pausedAt !== null) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [session]);

    useEffect(() => {
        // A backgrounded tab has its timers throttled, so the clock catches up the moment the
        // tab is looked at again rather than drifting behind.
        const resync = () => setNow(Date.now());
        document.addEventListener('visibilitychange', resync);
        window.addEventListener('focus', resync);
        return () => {
            document.removeEventListener('visibilitychange', resync);
            window.removeEventListener('focus', resync);
        };
    }, []);

    /* --------------------------------------------------------------------- upload */

    const upload = useCallback(async (record: PendingFocus) => {
        setUploading(true);
        try {
            const res = await fetch('/api/ticktick/focus', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(record),
            });

            if (res.ok) {
                setPending(null);
                setNotice({
                    tone: 'good',
                    message: `Logged ${focusLabel(record.focusSeconds)} of focus on “${record.title}”.`,
                });
                return;
            }

            const body = await res.json().catch(() => ({}));
            const message = body.error || 'Could not save that focus session.';

            if (res.status === 400) {
                // The server will never accept this record, so keeping it would leave a retry
                // button that can only ever fail.
                setPending(null);
                setNotice({ tone: 'error', message });
            } else {
                setNotice({ tone: 'error', message: `${message} The session is kept — retry when it is fixed.` });
            }
        } catch {
            setNotice({
                tone: 'error',
                message: 'Could not reach the server. The session is kept — retry when you are back online.',
            });
        } finally {
            setUploading(false);
        }
    }, []);

    useEffect(() => {
        // One quiet attempt at a session left over from a previous visit, so a blip during the
        // last upload does not need the user to notice a retry button.
        if (!hydrated || !isAuthed || !pending || retriedRef.current) return;
        retriedRef.current = true;
        void upload(pending);
    }, [hydrated, isAuthed, pending, upload]);

    /* ------------------------------------------------------------------- pomodoro */

    const finish = useCallback(
        async (target: PomodoroSession) => {
            if (finishingRef.current === target.sessionId) return;
            finishingRef.current = target.sessionId;

            const outcome = resolveOutcome(target, Date.now());
            setSession(null);

            if (!outcome.loggable) {
                setNotice({
                    tone: 'muted',
                    message: `That session was under a minute, so nothing was recorded.`,
                });
                finishingRef.current = null;
                return;
            }

            const record = buildPendingFocus(target, outcome);
            setPending(record);
            await upload(record);
            finishingRef.current = null;
        },
        [upload]
    );

    useEffect(() => {
        if (session && session.pausedAt === null && isComplete(session, now)) void finish(session);
    }, [session, now, finish]);

    const begin = useCallback(
        async (task: Pick<PanelTask, 'id' | 'title' | 'list'>) => {
            // Starting a second pomodoro banks the first rather than discarding it — switching
            // tasks mid-flow is normal, and the time already spent was still spent.
            if (session) await finish(session);

            setSession(
                startSession(
                    {
                        sessionId: newBrowserSessionId(),
                        taskId: task.id,
                        title: task.title,
                        list: task.list,
                        durationMin,
                    },
                    Date.now()
                )
            );
            setNow(Date.now());
        },
        [session, finish, durationMin]
    );

    const chooseDuration = (minutes: number) => {
        setDurationMin(minutes);
        setDurationOpen(false);
        writeStored(POMODORO_DURATION_KEY, minutes);
    };

    /* ----------------------------------------------------------------- task writes */

    const capture = async (thenFocus: boolean) => {
        const trimmed = title.trim();
        if (!trimmed || capturing) return;

        setCapturing(true);
        try {
            const res = await fetch('/api/ticktick/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ title: trimmed, list: captureList }),
            });
            const body = await res.json().catch(() => ({}));

            if (!res.ok) {
                setNotice({ tone: 'error', message: body.error || 'Could not add that task.' });
                return;
            }

            setTitle('');
            // The route echoes the task back in panel shape, so the new row appears at the top
            // immediately instead of waiting on another whole-account sync.
            const created: PanelTask = body.task;
            mutate((prev) => ({ tasks: [created, ...(prev?.tasks ?? [])] }), { revalidate: false });
            if (thenFocus) await begin(created);
        } catch {
            setNotice({ tone: 'error', message: 'Could not reach the server to add that task.' });
        } finally {
            setCapturing(false);
        }
    };

    const complete = async (task: PanelTask) => {
        if (completing.has(task.id)) return;
        setCompleting((prev) => new Set(prev).add(task.id));

        try {
            const res = await fetch(`/api/ticktick/tasks/${task.id}/complete`, {
                method: 'POST',
                credentials: 'same-origin',
            });

            if (res.ok) {
                mutate(
                    (prev) => ({ tasks: (prev?.tasks ?? []).filter((t) => t.id !== task.id) }),
                    { revalidate: false }
                );
                return;
            }

            const body = await res.json().catch(() => ({}));
            setNotice({ tone: 'error', message: body.error || 'Could not complete that task.' });
        } catch {
            setNotice({ tone: 'error', message: 'Could not reach the server to complete that task.' });
        } finally {
            setCompleting((prev) => {
                const next = new Set(prev);
                next.delete(task.id);
                return next;
            });
        }
    };

    /* ------------------------------------------------------------------ derived UI */

    const overdueCount = tasks.filter((t) => t.group === 'overdue').length;

    const countByList = useMemo(() => {
        const counts = new Map<TaskListKey, number>();
        for (const task of tasks) {
            if (task.list) counts.set(task.list, (counts.get(task.list) ?? 0) + 1);
        }
        return counts;
    }, [tasks]);

    const groups = useMemo(() => {
        const visible = filter === 'all' ? tasks : tasks.filter((t) => t.list === filter);
        return TASK_GROUPS.map((group) => ({
            group,
            items: visible.filter((t) => t.group === group),
        })).filter((g) => g.items.length > 0);
    }, [tasks, filter]);

    const remaining = session ? remainingMs(session, now) : 0;
    const progress = session ? 1 - remaining / (session.durationMin * 60_000) : 0;

    useEffect(() => {
        if (!notice || notice.tone === 'error') return;
        const id = setTimeout(() => setNotice(null), 6000);
        return () => clearTimeout(id);
    }, [notice]);

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen]);

    const openPanel = () => {
        if (!isAuthed) {
            onRequestUnlock();
            return;
        }
        setIsOpen(true);
        void mutate();
    };

    /* ----------------------------------------------------------------------- render */

    return (
        <>
            <motion.button
                onClick={openPanel}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                aria-label={isAuthed ? 'Open tasks' : 'Unlock the dashboard to open tasks'}
                // Fixed width, shared with the vault pill below: the two read as one rail only
                // if they share an edge, and this label changes length constantly — task count,
                // then a task title — so an intrinsic width would resize the button under the
                // cursor every time the state moved.
                className="fixed bottom-[6.25rem] right-8 z-40 w-40 flex items-center gap-3 bg-zinc-900 text-white px-5 py-3.5 rounded-full shadow-2xl shadow-indigo-500/20 border border-zinc-800 hover:bg-zinc-800 transition-colors group"
            >
                <div className="relative shrink-0">
                    {!isAuthed ? (
                        <Lock className="w-5 h-5 text-zinc-400" />
                    ) : session ? (
                        <Timer className="w-5 h-5 text-amber-400" />
                    ) : (
                        <ListChecks className="w-5 h-5 text-amber-400 group-hover:rotate-6 transition-transform" />
                    )}
                    {isAuthed && !session && overdueCount > 0 && (
                        <span className="absolute -top-2 -right-2.5 min-w-[19px] h-[19px] px-1 rounded-full bg-rose-600 border-2 border-zinc-900 text-[10px] font-bold flex items-center justify-center">
                            {overdueCount}
                        </span>
                    )}
                    {isAuthed && pending && (
                        <span className="absolute -top-1.5 -right-2 w-2.5 h-2.5 rounded-full bg-amber-400 border-2 border-zinc-900" />
                    )}
                </div>

                <div className="flex flex-col items-start leading-none min-w-0 flex-1">
                    {/* The eyebrow treatment is for a fixed word. A task title is neither fixed
                        nor an eyebrow, and uppercase + wide tracking costs it about half its
                        characters before the truncation bites. */}
                    <span
                        className={cn(
                            'w-full text-left text-[10px] font-semibold mb-0.5 truncate',
                            session
                                ? 'text-amber-400/90'
                                : 'text-zinc-400 uppercase tracking-widest'
                        )}
                    >
                        {session ? session.title : 'Tasks'}
                    </span>
                    <span className="font-semibold tabular-nums">
                        {!isAuthed
                            ? 'Locked'
                            : session
                              ? formatClock(remaining)
                              : isLoading
                                ? '—'
                                : `${tasks.length} open`}
                    </span>
                </div>
            </motion.button>

            <AnimatePresence>
                {isOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsOpen(false)}
                            className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
                        />

                        <motion.div
                            role="dialog"
                            aria-modal="true"
                            aria-label="Tasks"
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-2xl bg-white rounded-[2rem] shadow-2xl border border-zinc-200/60 overflow-hidden flex flex-col max-h-[90vh]"
                        >
                            {/* Header */}
                            <div className="p-6 pb-4 border-b border-zinc-100 flex items-start justify-between bg-zinc-50/50">
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className="p-3 bg-zinc-900 rounded-2xl">
                                        <ListChecks className="w-7 h-7 text-white" />
                                    </div>
                                    <div className="min-w-0">
                                        <h2 className="text-xl font-semibold text-zinc-900">Tasks</h2>
                                        <p className="text-sm text-zinc-500">
                                            {tasks.length} open
                                            {overdueCount > 0 && (
                                                <>
                                                    {' · '}
                                                    <strong className="text-rose-600 font-semibold">
                                                        {overdueCount} overdue
                                                    </strong>
                                                </>
                                            )}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    aria-label="Close"
                                    className="p-2 hover:bg-zinc-100 rounded-full text-zinc-400 hover:text-zinc-600 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Capture. The row wraps on narrow screens rather than squeezing the
                                field down to a few characters beside the two buttons. */}
                            <div className="px-6 py-4 border-b border-zinc-100 flex flex-col gap-2.5">
                                <form
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        void capture(false);
                                    }}
                                    className="flex flex-wrap gap-2"
                                >
                                    <input
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder="What needs doing?"
                                        className="w-full sm:w-auto sm:flex-1 min-w-0 h-11 px-4 bg-zinc-50 border border-zinc-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 focus:bg-white transition-all"
                                    />
                                    <button
                                        type="submit"
                                        disabled={!title.trim() || capturing}
                                        aria-label="Add task"
                                        className="w-11 h-11 shrink-0 rounded-2xl border border-zinc-200 text-zinc-500 hover:text-zinc-900 hover:border-zinc-300 disabled:opacity-40 transition-colors flex items-center justify-center"
                                    >
                                        <Plus className="w-[18px] h-[18px]" />
                                    </button>

                                    {/* The popup lives outside the rounded clip below, or it would be
                                        cropped out of existence on the way up. */}
                                    <div className="relative shrink-0 flex">
                                        <div className="flex items-stretch rounded-2xl bg-zinc-900 text-white overflow-hidden">
                                            <button
                                                type="button"
                                                onClick={() => void capture(true)}
                                                disabled={!title.trim() || capturing}
                                                className="flex items-center gap-2 pl-4 pr-3 text-[13px] font-semibold hover:bg-zinc-800 disabled:opacity-40 transition-colors"
                                            >
                                                <Play className="w-3 h-3 fill-current" />
                                                Focus
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDurationOpen((v) => !v)}
                                                aria-label="Change focus length"
                                                className="px-3 text-[13px] tabular-nums text-zinc-400 border-l border-zinc-700 hover:text-white hover:bg-zinc-800 transition-colors"
                                            >
                                                {durationMin}m
                                            </button>
                                        </div>

                                        {durationOpen && (
                                            <>
                                                <div
                                                    className="fixed inset-0 z-10"
                                                    onClick={() => setDurationOpen(false)}
                                                />
                                                <div className="absolute z-20 bottom-full right-0 mb-2 flex gap-1 p-1 bg-white rounded-2xl border border-zinc-200 shadow-xl">
                                                    {FOCUS_DURATION_OPTIONS.map((minutes) => (
                                                        <button
                                                            key={minutes}
                                                            type="button"
                                                            onClick={() => chooseDuration(minutes)}
                                                            className={cn(
                                                                'px-3 h-8 rounded-xl text-xs font-semibold tabular-nums transition-colors',
                                                                minutes === durationMin
                                                                    ? 'bg-zinc-900 text-white'
                                                                    : 'text-zinc-500 hover:bg-zinc-100'
                                                            )}
                                                        >
                                                            {minutes}m
                                                        </button>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </form>

                                <div className="flex items-center gap-1.5 flex-wrap">
                                    {CAPTURE_LIST_KEYS.map((key) => (
                                        <button
                                            key={key}
                                            onClick={() => setCaptureList(key)}
                                            className={cn(
                                                'h-8 px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors',
                                                key === captureList
                                                    ? 'bg-zinc-900 border-zinc-900 text-white'
                                                    : 'bg-white border-zinc-200 text-zinc-500 hover:border-zinc-300'
                                            )}
                                        >
                                            <span
                                                className="w-1.5 h-1.5 rounded-full"
                                                style={{
                                                    backgroundColor:
                                                        key === captureList ? '#ffffff' : TASK_LISTS[key].color,
                                                }}
                                            />
                                            {TASK_LISTS[key].label}
                                        </button>
                                    ))}
                                    <span className="ml-auto text-[11px] text-zinc-400">
                                        Top priority · due now
                                    </span>
                                </div>
                            </div>

                            {/* Notices */}
                            <AnimatePresence>
                                {(notice || pending) && (
                                    <motion.div
                                        // Opacity only. Animating height needs a measured pixel value,
                                        // which goes stale the moment the text rewraps at a narrower
                                        // width — and then the strip clips its own second line.
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="border-b border-zinc-100"
                                    >
                                        <div
                                            className={cn(
                                                'px-6 py-2.5 flex items-center gap-2 text-xs',
                                                notice?.tone === 'error'
                                                    ? 'bg-rose-50 text-rose-700'
                                                    : notice?.tone === 'good'
                                                      ? 'bg-emerald-50 text-emerald-700'
                                                      : 'bg-zinc-50 text-zinc-500'
                                            )}
                                        >
                                            {notice?.tone === 'error' && (
                                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                            )}
                                            <span className="min-w-0">
                                                {notice?.message ??
                                                    `${focusLabel(pending!.focusSeconds)} of focus is waiting to be saved.`}
                                            </span>
                                            {pending && (
                                                <button
                                                    onClick={() => void upload(pending)}
                                                    disabled={uploading}
                                                    className="ml-auto shrink-0 flex items-center gap-1 font-semibold hover:underline disabled:opacity-50"
                                                >
                                                    <RotateCcw className="w-3 h-3" />
                                                    {uploading ? 'Saving…' : 'Retry'}
                                                </button>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Filters */}
                            <div className="px-6 py-2.5 border-b border-zinc-100 flex gap-1.5 overflow-x-auto">
                                {(['all', ...Object.keys(TASK_LISTS)] as Filter[]).map((key) => {
                                    const count =
                                        key === 'all' ? tasks.length : countByList.get(key as TaskListKey) ?? 0;
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => setFilter(key)}
                                            className={cn(
                                                'h-7 px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 shrink-0 border transition-colors',
                                                key === filter
                                                    ? 'bg-zinc-900 border-zinc-900 text-white'
                                                    : 'bg-zinc-50 border-zinc-100 text-zinc-500 hover:border-zinc-200'
                                            )}
                                        >
                                            {key !== 'all' && <ListDot list={key as TaskListKey} />}
                                            {key === 'all' ? 'All' : TASK_LISTS[key as TaskListKey].label}
                                            <span
                                                className={cn(
                                                    'tabular-nums font-bold text-[11px]',
                                                    key === filter ? 'text-zinc-300' : 'text-zinc-400'
                                                )}
                                            >
                                                {count}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* List */}
                            <div className="flex-1 overflow-y-auto min-h-[8rem]">
                                {error ? (
                                    <div className="px-6 py-10 text-center text-sm text-rose-600">
                                        {(error as Error).message}
                                    </div>
                                ) : isLoading ? (
                                    <div className="px-6 py-10 text-center text-sm text-zinc-400">
                                        Loading your tasks…
                                    </div>
                                ) : groups.length === 0 ? (
                                    <div className="px-6 py-10 text-center text-sm text-zinc-400">
                                        {tasks.length === 0
                                            ? 'Nothing open. Add the first thing above.'
                                            : 'Nothing in this list.'}
                                    </div>
                                ) : (
                                    groups.map(({ group, items }) => (
                                        <div key={group}>
                                            <div
                                                className={cn(
                                                    'px-6 pt-3.5 pb-1.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em]',
                                                    group === 'overdue' ? 'text-rose-600' : 'text-zinc-400'
                                                )}
                                            >
                                                {TASK_GROUP_LABELS[group]} · {items.length}
                                                <span className="flex-1 h-px bg-zinc-100" />
                                            </div>

                                            {items.map((task) => {
                                                const isCompleting = completing.has(task.id);
                                                const isFocused = session?.taskId === task.id;
                                                return (
                                                    <div
                                                        key={task.id}
                                                        className={cn(
                                                            'group/row flex items-center gap-3 px-6 py-2.5 border-t border-zinc-50 transition-colors',
                                                            isFocused ? 'bg-zinc-50' : 'hover:bg-zinc-50/60'
                                                        )}
                                                    >
                                                        <button
                                                            onClick={() => void complete(task)}
                                                            disabled={isCompleting}
                                                            aria-label={`Complete ${task.title}`}
                                                            className={cn(
                                                                'w-[19px] h-[19px] shrink-0 rounded-full border-2 flex items-center justify-center transition-colors',
                                                                isCompleting
                                                                    ? 'bg-zinc-900 border-zinc-900 text-white'
                                                                    : 'hover:bg-zinc-100'
                                                            )}
                                                            style={
                                                                isCompleting
                                                                    ? undefined
                                                                    : { borderColor: PRIORITY_RINGS[task.priority] ?? PRIORITY_RINGS[0] }
                                                            }
                                                        >
                                                            {isCompleting && <Check className="w-2.5 h-2.5" strokeWidth={4} />}
                                                        </button>

                                                        <span
                                                            className={cn(
                                                                'flex-1 min-w-0 text-[13.5px] font-medium truncate',
                                                                isCompleting
                                                                    ? 'text-zinc-400 line-through'
                                                                    : 'text-zinc-800'
                                                            )}
                                                        >
                                                            {task.title}
                                                        </span>

                                                        <span
                                                            className="text-[11px] font-semibold px-2 py-0.5 rounded-md shrink-0 tabular-nums"
                                                            style={
                                                                group === 'overdue'
                                                                    ? { backgroundColor: '#fff1f2', color: OVERDUE }
                                                                    : { backgroundColor: '#fafafa', color: '#a1a1aa' }
                                                            }
                                                        >
                                                            {task.dueLabel ?? '—'}
                                                        </span>

                                                        <span className="hidden sm:flex items-center gap-1.5 w-16 shrink-0 text-[11px] text-zinc-400">
                                                            <ListDot list={task.list} />
                                                            <span className="truncate">
                                                                {task.list ? TASK_LISTS[task.list].label : '—'}
                                                            </span>
                                                        </span>

                                                        <button
                                                            onClick={() => void begin(task)}
                                                            aria-label={`Start a focus session on ${task.title}`}
                                                            className={cn(
                                                                'w-7 h-7 shrink-0 rounded-lg flex items-center justify-center transition-all',
                                                                isFocused
                                                                    ? 'bg-zinc-900 text-white'
                                                                    : 'text-zinc-300 hover:bg-zinc-100 hover:text-zinc-600 sm:opacity-0 sm:group-hover/row:opacity-100 focus-visible:opacity-100'
                                                            )}
                                                        >
                                                            <Play className="w-2.5 h-2.5 fill-current" />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Running session */}
                            {session && (
                                <div className="border-t border-zinc-100">
                                    <div className="h-0.5 bg-zinc-200">
                                        <div
                                            className="h-full bg-zinc-900 transition-[width] duration-1000 ease-linear"
                                            style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
                                        />
                                    </div>
                                    <div className="px-6 py-3 flex items-center gap-3.5 bg-zinc-50">
                                        <span className="text-[25px] font-light tabular-nums leading-none text-zinc-900">
                                            {formatClock(remaining)}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[9.5px] font-bold uppercase tracking-[0.15em] text-zinc-400">
                                                {session.pausedAt !== null ? 'Paused' : 'Focusing'}
                                            </div>
                                            <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-zinc-700 truncate">
                                                <ListDot list={session.list} />
                                                <span className="truncate">{session.title}</span>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => {
                                                const at = Date.now();
                                                setSession((s) =>
                                                    s
                                                        ? s.pausedAt !== null
                                                            ? resumeSession(s, at)
                                                            : pauseSession(s, at)
                                                        : s
                                                );
                                                // The ticker is stopped while paused, so `now` is stale by
                                                // exactly the length of the pause. Without this the clock
                                                // reads negative elapsed — and clamps back to the full
                                                // duration — until the next tick lands.
                                                setNow(at);
                                            }}
                                            className="h-8 px-3 shrink-0 rounded-xl border border-zinc-200 bg-white text-zinc-500 hover:text-zinc-900 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                                        >
                                            {session.pausedAt !== null ? (
                                                <>
                                                    <Play className="w-3 h-3 fill-current" /> Resume
                                                </>
                                            ) : (
                                                <>
                                                    <Pause className="w-3 h-3" /> Pause
                                                </>
                                            )}
                                        </button>
                                        <button
                                            onClick={() => void finish(session)}
                                            disabled={uploading}
                                            className="h-8 px-3 shrink-0 rounded-xl bg-zinc-900 text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                                        >
                                            <Check className="w-3 h-3" strokeWidth={3} /> Done
                                        </button>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
}

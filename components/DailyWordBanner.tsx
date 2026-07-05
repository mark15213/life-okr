'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Lock,
  MessageSquareText,
  NotebookPen,
  PenLine,
  Plus,
  Quote,
  Smile,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type DailyWordKind = 'mood' | 'thought' | 'maxim' | 'note';

interface DailyWord {
  date: string;
  kind: DailyWordKind;
  content: string;
  updatedAt: string;
}

interface DailyWordBannerProps {
  isAuthed: boolean;
}

interface KindOption {
  label: string;
  icon: LucideIcon;
  color: string;
  dot: string;
  bg: string;
}

const KIND_OPTIONS: Record<DailyWordKind, KindOption> = {
  mood: {
    label: 'Mood',
    icon: Smile,
    color: 'text-rose-600',
    dot: 'bg-rose-600',
    bg: 'bg-rose-50',
  },
  thought: {
    label: 'Thought',
    icon: MessageSquareText,
    color: 'text-sky-600',
    dot: 'bg-sky-600',
    bg: 'bg-sky-50',
  },
  maxim: {
    label: 'Maxim',
    icon: Quote,
    color: 'text-amber-600',
    dot: 'bg-amber-600',
    bg: 'bg-amber-50',
  },
  note: {
    label: 'Note',
    icon: NotebookPen,
    color: 'text-emerald-600',
    dot: 'bg-emerald-600',
    bg: 'bg-emerald-50',
  },
};

const KIND_KEYS: DailyWordKind[] = ['mood', 'thought', 'maxim', 'note'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_NAMES = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function offsetDateKey(dateKey: string, offset: number): string {
  const date = fromDateKey(dateKey);
  date.setDate(date.getDate() + offset);
  return toDateKey(date);
}

function displayDate(dateKey: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(fromDateKey(dateKey));
}

function displayShortDate(dateKey: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(fromDateKey(dateKey));
}

function displayWeekday(dateKey: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(fromDateKey(dateKey));
}

function makeInitialWords(todayKey: string): DailyWord[] {
  const year = fromDateKey(todayKey).getFullYear();
  const nowIso = new Date().toISOString();

  return [
    {
      date: todayKey,
      kind: 'maxim',
      content: 'A person who has only the urge to control, yet cannot truly control anything, has no power, only an unsatisfied desire.\nAnd unsatisfied desire has become the source of the most common unhappiness of modern people.',
      updatedAt: nowIso,
    },
    {
      date: offsetDateKey(todayKey, -2),
      kind: 'thought',
      content: '能量不是被找到的，是在开始以后慢慢升起来的。',
      updatedAt: nowIso,
    },
    {
      date: offsetDateKey(todayKey, -6),
      kind: 'mood',
      content: '状态一般，但仍然完成了该完成的事。',
      updatedAt: nowIso,
    },
    {
      date: `${year}-01-09`,
      kind: 'note',
      content: '给系统留一个安静的位置，让每天的自己都有地方落脚。',
      updatedAt: nowIso,
    },
  ];
}

export default function DailyWordBanner({ isAuthed }: DailyWordBannerProps) {
  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const [words, setWords] = useState<DailyWord[]>(() => makeInitialWords(todayKey));
  const [publishedDate, setPublishedDate] = useState<string | null>(todayKey);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [calendarYear, setCalendarYear] = useState(() => fromDateKey(todayKey).getFullYear());
  const [draftDate, setDraftDate] = useState(todayKey);
  const [draftKind, setDraftKind] = useState<DailyWordKind>('maxim');
  const [draftContent, setDraftContent] = useState('');

  const wordsByDate = useMemo(() => {
    const map = new Map<string, DailyWord>();
    for (const word of words) map.set(word.date, word);
    return map;
  }, [words]);

  const selectedWord = wordsByDate.get(selectedDate) ?? null;
  const yearWordCount = words.filter((word) => word.date.startsWith(`${calendarYear}-`)).length;

  const openEditor = (dateKey: string) => {
    const existing = wordsByDate.get(dateKey);
    setDraftDate(dateKey);
    setDraftKind(existing?.kind ?? 'maxim');
    setDraftContent(existing?.content ?? '');
    setIsEditorOpen(true);
  };

  const saveDraft = (event: React.FormEvent) => {
    event.preventDefault();
    const content = draftContent.trim();
    if (!content || !isAuthed) return;

    const nextWord: DailyWord = {
      date: draftDate,
      kind: draftKind,
      content,
      updatedAt: new Date().toISOString(),
    };

    setWords((current) => {
      const withoutSameDate = current.filter((word) => word.date !== draftDate);
      return [...withoutSameDate, nextWord].sort((a, b) => b.date.localeCompare(a.date));
    });
    setSelectedDate(draftDate);
    setPublishedDate(draftDate);
    setCalendarYear(fromDateKey(draftDate).getFullYear());
    setIsEditorOpen(false);
  };

  const deleteWord = (dateKey: string) => {
    if (!isAuthed) return;
    setWords((current) => current.filter((word) => word.date !== dateKey));
    if (publishedDate === dateKey) setPublishedDate(null);
  };

  const showCalendar = () => {
    const dateToShow = publishedDate ?? todayKey;
    setSelectedDate(dateToShow);
    setCalendarYear(fromDateKey(dateToShow).getFullYear());
    setIsCalendarOpen(true);
  };

  const bannerWord = publishedDate ? wordsByDate.get(publishedDate) ?? null : null;
  const bannerKind = bannerWord ? KIND_OPTIONS[bannerWord.kind] : KIND_OPTIONS.note;
  const carriedFromAnotherDay = bannerWord && bannerWord.date !== todayKey;

  return (
    <>
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="mb-8 rounded-xl border border-zinc-200/80 bg-white/65 backdrop-blur-sm"
      >
        <div className="flex items-start gap-4 px-4 py-4 sm:px-5">
          <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-400">
            <Quote className="h-4 w-4" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
              <span>Daily Word</span>
              <span className="text-zinc-300">/</span>
              <span>{bannerWord ? bannerKind.label : 'Quiet'}</span>
              {bannerWord && (
                <>
                  <span className="text-zinc-300">/</span>
                  <span>{displayShortDate(bannerWord.date)}</span>
                </>
              )}
              {carriedFromAnotherDay && (
                <>
                  <span className="text-zinc-300">/</span>
                  <span>Kept</span>
                </>
              )}
            </div>
            {bannerWord ? (
              <blockquote
                className="w-full whitespace-pre-line break-words text-lg font-medium leading-[1.65] text-zinc-600 sm:text-xl sm:leading-[1.6]"
              >
                {bannerWord.content}
              </blockquote>
            ) : (
              <div className="text-lg font-medium leading-[1.65] text-zinc-400 sm:text-xl sm:leading-[1.6]">
                No quote published.
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1 border-l border-zinc-100 pl-3">
            <button
              type="button"
              onClick={showCalendar}
              aria-label="Open archive"
              className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
              title="Open archive"
            >
              <CalendarDays className="h-4 w-4" />
            </button>

            {isAuthed ? (
              <>
                <button
                  type="button"
                  onClick={() => openEditor(todayKey)}
                  aria-label={wordsByDate.has(todayKey) ? 'Edit today' : 'Write today'}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-white"
                  title={wordsByDate.has(todayKey) ? 'Edit today' : 'Write today'}
                >
                  {wordsByDate.has(todayKey) ? <PenLine className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => bannerWord && deleteWord(bannerWord.date)}
                  disabled={!bannerWord}
                  aria-label={bannerWord ? 'Delete quote' : 'Nothing published'}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                  title={bannerWord ? 'Delete displayed word' : 'Nothing is published'}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled
                aria-label="Locked"
                className="flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-full text-zinc-300"
                title="Unlock to write"
              >
                <Lock className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </motion.section>

      <AnimatePresence>
        {isEditorOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditorOpen(false)}
              className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
            />

            <motion.form
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              onSubmit={saveDraft}
              className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-2xl"
            >
              <div className="flex items-start justify-between border-b border-zinc-100 bg-zinc-50/80 p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-900 text-white">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-zinc-900">Daily Word</h2>
                    <p className="text-sm text-zinc-500">{wordsByDate.has(draftDate) ? 'Replace entry' : 'New entry'}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="rounded-full p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                  title="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-6 overflow-y-auto p-6">
                <div className="grid gap-4 sm:grid-cols-[190px_1fr]">
                  <label className="space-y-2">
                    <span className="text-xs font-semibold text-zinc-500">Date</span>
                    <input
                      type="date"
                      max={todayKey}
                      value={draftDate}
                      onChange={(event) => setDraftDate(event.target.value)}
                      className="h-11 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-sm font-semibold text-zinc-900 outline-none transition-all focus:border-zinc-400 focus:bg-white"
                    />
                  </label>

                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-zinc-500">Type</span>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {KIND_KEYS.map((kind) => {
                        const option = KIND_OPTIONS[kind];
                        const Icon = option.icon;
                        const active = draftKind === kind;
                        return (
                          <button
                            key={kind}
                            type="button"
                            onClick={() => setDraftKind(kind)}
                            className={cn(
                              'flex h-11 items-center justify-center gap-2 rounded-2xl border px-3 text-sm font-semibold transition-colors',
                              active
                                ? 'border-zinc-900 bg-zinc-900 text-white'
                                : 'border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'
                            )}
                          >
                            <Icon className="h-4 w-4" />
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <label className="block space-y-2">
                  <span className="text-xs font-semibold text-zinc-500">Content</span>
                  <textarea
                    value={draftContent}
                    onChange={(event) => setDraftContent(event.target.value.slice(0, 500))}
                    rows={7}
                    placeholder="Write one line worth keeping."
                    className="w-full resize-none rounded-[1.5rem] border border-zinc-200 bg-zinc-50 px-5 py-4 text-lg leading-relaxed text-zinc-900 outline-none transition-all placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white"
                    style={{ fontFamily: 'var(--font-newspaper)' }}
                  />
                  <div className="flex justify-end text-xs font-medium text-zinc-400">{draftContent.length}/500</div>
                </label>
              </div>

              <div className="flex gap-3 border-t border-zinc-100 p-6">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="flex-1 rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!draftContent.trim()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Check className="h-4 w-4" />
                  Save
                </button>
              </div>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCalendarOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCalendarOpen(false)}
              className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              className="relative flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-2xl"
            >
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-100 bg-zinc-50/80 p-5 sm:p-6">
                <div>
                  <h2 className="text-2xl font-semibold text-zinc-900">Daily Words</h2>
                  <p className="text-sm text-zinc-500">{yearWordCount} entries in {calendarYear}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCalendarYear((year) => year - 1)}
                    className="flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-500 transition-colors hover:text-zinc-900"
                    title="Previous year"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <div className="flex h-10 min-w-24 items-center justify-center rounded-2xl bg-zinc-900 px-4 text-sm font-semibold text-white">
                    {calendarYear}
                  </div>
                  <button
                    type="button"
                    onClick={() => setCalendarYear((year) => year + 1)}
                    className="flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-500 transition-colors hover:text-zinc-900"
                    title="Next year"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCalendarOpen(false)}
                    className="ml-1 flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                    title="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="order-last grid gap-3 p-4 sm:grid-cols-2 sm:p-6 lg:order-none xl:grid-cols-3">
                  {MONTH_NAMES.map((monthName, monthIndex) => (
                    <MonthPanel
                      key={monthName}
                      monthName={monthName}
                      monthIndex={monthIndex}
                      year={calendarYear}
                      todayKey={todayKey}
                      selectedDate={selectedDate}
                      wordsByDate={wordsByDate}
                      onSelectDate={setSelectedDate}
                    />
                  ))}
                </div>

                <aside className="order-first border-b border-zinc-100 bg-white p-6 lg:order-none lg:border-b-0 lg:border-l">
                  <div className="space-y-5 lg:sticky lg:top-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-zinc-400">{displayWeekday(selectedDate)}</div>
                        <h3 className="mt-1 text-2xl font-semibold text-zinc-900">{displayDate(selectedDate)}</h3>
                      </div>
                      {selectedWord && (
                        <div className={cn('flex h-10 w-10 items-center justify-center rounded-2xl', KIND_OPTIONS[selectedWord.kind].bg)}>
                          {(() => {
                            const Icon = KIND_OPTIONS[selectedWord.kind].icon;
                            return <Icon className={cn('h-5 w-5', KIND_OPTIONS[selectedWord.kind].color)} />;
                          })()}
                        </div>
                      )}
                    </div>

                    {selectedWord ? (
                      <div className="space-y-5">
                        <div className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50 p-5">
                          <div className="mb-3 text-xs font-semibold text-zinc-500">
                            {KIND_OPTIONS[selectedWord.kind].label}
                          </div>
                          <p
                            className="whitespace-pre-line break-words text-2xl font-semibold leading-[1.55] text-zinc-600"
                          >
                            {selectedWord.content}
                          </p>
                        </div>
                        {isAuthed ? (
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => openEditor(selectedWord.date)}
                              className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-zinc-900 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
                            >
                              <PenLine className="h-4 w-4" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteWord(selectedWord.date)}
                              className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-zinc-200 text-sm font-semibold text-zinc-500 transition-colors hover:border-red-100 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-100 text-sm font-semibold text-zinc-400"
                          >
                            <Lock className="h-4 w-4" />
                            Locked
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-5">
                        <div className="rounded-[1.5rem] border border-dashed border-zinc-200 bg-zinc-50 p-5 text-zinc-400">
                          <p className="text-lg font-semibold">No entry for this date.</p>
                        </div>
                        {isAuthed && selectedDate <= todayKey && (
                          <button
                            type="button"
                            onClick={() => openEditor(selectedDate)}
                            className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-zinc-900 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
                          >
                            <Plus className="h-4 w-4" />
                            Add
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </aside>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

function MonthPanel({
  monthName,
  monthIndex,
  year,
  todayKey,
  selectedDate,
  wordsByDate,
  onSelectDate,
}: {
  monthName: string;
  monthIndex: number;
  year: number;
  todayKey: string;
  selectedDate: string;
  wordsByDate: Map<string, DailyWord>;
  onSelectDate: (dateKey: string) => void;
}) {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const cells = [
    ...Array.from({ length: firstWeekday }, (_, index) => ({ type: 'empty' as const, key: `empty-${index}` })),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const dateKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return { type: 'day' as const, key: dateKey, day, dateKey };
    }),
  ];

  return (
    <section className="rounded-[1.5rem] border border-zinc-200 bg-white p-4 shadow-[0_4px_18px_rgba(15,23,42,0.03)]">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">{monthName}</h3>
        <span className="text-xs font-medium text-zinc-400">
          {Array.from(wordsByDate.keys()).filter((dateKey) => dateKey.startsWith(`${year}-${String(monthIndex + 1).padStart(2, '0')}`)).length}
        </span>
      </div>
      <div className="mb-2 grid grid-cols-7 gap-1">
        {WEEKDAY_NAMES.map((weekday, index) => (
          <div key={`${weekday}-${index}`} className="flex h-6 items-center justify-center text-[11px] font-semibold text-zinc-300">
            {weekday}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          if (cell.type === 'empty') return <div key={cell.key} className="aspect-square" />;

          const word = wordsByDate.get(cell.dateKey);
          const isToday = cell.dateKey === todayKey;
          const isSelected = cell.dateKey === selectedDate;
          const isFuture = cell.dateKey > todayKey;

          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => onSelectDate(cell.dateKey)}
              disabled={isFuture}
              className={cn(
                'relative flex aspect-square min-h-8 items-center justify-center rounded-xl text-xs font-semibold transition-colors',
                isSelected && 'bg-zinc-900 text-white',
                !isSelected && word && 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200',
                !isSelected && !word && 'text-zinc-400 hover:bg-zinc-50 hover:text-zinc-700',
                isToday && !isSelected && 'ring-1 ring-zinc-900/30',
                isFuture && 'cursor-not-allowed opacity-25 hover:bg-transparent hover:text-zinc-400'
              )}
              title={cell.dateKey}
            >
              {cell.day}
              {word && (
                <span
                  className={cn(
                    'absolute bottom-1 h-1 w-1 rounded-full',
                    isSelected ? 'bg-white' : KIND_OPTIONS[word.kind].dot
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

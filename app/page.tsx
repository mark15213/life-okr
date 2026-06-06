'use client';

import { useState } from 'react';
import Link from 'next/link';
import PushupCard from '@/components/PushupCard';
import FocusCard from '@/components/FocusCard';
import TaskCard from '@/components/TaskCard';
import TokenCard from '@/components/TokenCard';
import FloatingVault from '@/components/FloatingVault';
import useSWR from 'swr';
import { DailyRecord, TokenUsageRow, withTicktickSummed } from '@/lib/db';
import { usePasscode } from '@/lib/usePasscode';
import { BarChart2, Lock, Unlock } from 'lucide-react';

export default function Home() {
  const { isAuthed, verify } = usePasscode();
  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeError, setPasscodeError] = useState(false);

  const fetcher = (url: string) => fetch(url).then(res => res.json());

  const { data: todayData, mutate: mutateToday } = useSWR('/api/records/today', fetcher);
  const { data: recordsData, mutate: mutateRecords } = useSWR('/api/records?days=30', fetcher);
  const { data: tokensData } = useSWR('/api/tokens?days=30', fetcher);
  const tokenEntries: TokenUsageRow[] = tokensData?.entries || [];

  const loading = !todayData || !recordsData;

  const todayRecord: DailyRecord | null = todayData?.record || null;
  const cumulativeBalance: number = todayData?.cumulativePushupBalance ?? todayData?.record?.pushup_balance ?? 0;
  const records: DailyRecord[] = recordsData?.records || [];

  // Display-side aggregation: manual + ticktick columns are summed for UI.
  // The raw columns remain available on todayRecord for optimistic-update math.
  const displayFocusMinutesToday = todayRecord
    ? todayRecord.focus_minutes + (todayRecord.focus_minutes_ticktick ?? 0)
    : 0;
  const displayTasksCompletedToday = todayRecord
    ? todayRecord.tasks_completed + (todayRecord.tasks_completed_ticktick ?? 0)
    : 0;

  const displayRecords: DailyRecord[] = records.map(withTicktickSummed);

  const handlePasscodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!verify(passcodeInput)) {
      setPasscodeError(true);
      setTimeout(() => setPasscodeError(false), 1500);
    }
    setPasscodeInput('');
  };

  const handleCigarette = async () => {
    if (!todayRecord) return;
    const optimisticRecord = { ...todayRecord, cigarettes: todayRecord.cigarettes + 1 };
    mutateToday({ ...todayData, record: optimisticRecord }, false);
    await fetch('/api/records/cigarette', { method: 'POST' });
    mutateToday();
    mutateRecords();
  };

  const handleExercise = async (calories: number) => {
    if (!todayRecord) return;
    const optimisticRecord = { ...todayRecord, exercises: todayRecord.exercises + 1 };
    mutateToday({ ...todayData, record: optimisticRecord }, false);
    await fetch('/api/records/exercise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calories }),
    });
    mutateToday();
    mutateRecords();
  };

  const handleAddFocus = async (minutes: number) => {
    if (!todayRecord) return;
    const optimisticRecord = { ...todayRecord, focus_minutes: todayRecord.focus_minutes + minutes };
    mutateToday({ ...todayData, record: optimisticRecord }, false);
    await fetch('/api/records/focus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minutes }),
    });
    mutateToday();
    mutateRecords();
  };

  const handleAddTask = async () => {
    if (!todayRecord) return;
    const optimisticRecord = { ...todayRecord, tasks_completed: todayRecord.tasks_completed + 1 };
    mutateToday({ ...todayData, record: optimisticRecord }, false);
    await fetch('/api/records/task', { method: 'POST' });
    mutateToday();
    mutateRecords();
  };

  const calculateWeeklyAverage = (field: keyof DailyRecord) => {
    const weekRecords = displayRecords.slice(0, 7);
    if (weekRecords.length === 0) return 0;
    const sum = weekRecords.reduce((acc, r) => acc + (r[field] as number), 0);
    return Math.round(sum / weekRecords.length);
  };

  const calculateMonthlyAverage = (field: keyof DailyRecord) => {
    const monthRecords = displayRecords.slice(0, 30);
    if (monthRecords.length === 0) return 0;
    const sum = monthRecords.reduce((acc, r) => acc + (r[field] as number), 0);
    return Math.round(sum / monthRecords.length);
  };

  const calculateTotal = (field: keyof DailyRecord, days: number) => {
    const selectedRecords = displayRecords.slice(0, days);
    return selectedRecords.reduce((acc, r) => acc + (r[field] as number), 0);
  };

  const tokensByDate = (() => {
    const m = new Map<string, { claude_code: number; codex: number }>();
    for (const e of tokenEntries) {
      const cur = m.get(e.date) ?? { claude_code: 0, codex: 0 };
      cur[e.tool as 'claude_code' | 'codex'] = e.total_tokens;
      m.set(e.date, cur);
    }
    return m;
  })();

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayKey = `${yyyy}-${mm}-${dd}`;
  const todayClaude = tokensByDate.get(todayKey)?.claude_code ?? 0;
  const todayCodex = tokensByDate.get(todayKey)?.codex ?? 0;
  const todayTokens = todayClaude + todayCodex;

  const sortedDailyTotals: number[] = [...tokensByDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([, v]) => v.claude_code + v.codex);
  const weekTokens = sortedDailyTotals.slice(0, 7);
  const monthTokens = sortedDailyTotals.slice(0, 30);
  const tokensWeeklyAverage = weekTokens.length
    ? Math.round(weekTokens.reduce((a, b) => a + b, 0) / weekTokens.length)
    : 0;
  const tokensMonthlyAverage = monthTokens.length
    ? Math.round(monthTokens.reduce((a, b) => a + b, 0) / monthTokens.length)
    : 0;

  if (loading || !todayRecord) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-zinc-300 border-t-zinc-800 rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#f8fafc_0%,#ffffff_48%,#f6f3ee_100%)] relative overflow-hidden font-sans text-zinc-900 selection:bg-zinc-200">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03] mix-blend-multiply pointer-events-none" />

      <div className="max-w-[1700px] mx-auto relative z-10 px-5 sm:px-8 lg:px-12 py-10 md:py-16">
        {/* Header */}
        <header className="mb-14 flex flex-col gap-6 border-b border-zinc-200/80 pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-5xl md:text-6xl tracking-tighter text-zinc-900 drop-shadow-sm font-bold" style={{ fontFamily: 'var(--font-newspaper)', letterSpacing: '-0.02em' }}>
              Hustle.
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {/* Auth Status & Passcode Input */}
            {!isAuthed ? (
              <form onSubmit={handlePasscodeSubmit} className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-zinc-400" />
                <input
                  type="password"
                  value={passcodeInput}
                  onChange={(e) => setPasscodeInput(e.target.value)}
                  placeholder="Code"
                  className={`w-20 text-xs bg-zinc-100 border rounded-lg px-2.5 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-zinc-400 transition-all ${passcodeError ? 'border-red-400 bg-red-50' : 'border-zinc-200'}`}
                />
              </form>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                <Unlock className="w-3.5 h-3.5" />
                Unlocked
              </div>
            )}

            <Link
              href="/analytics"
              className="flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors uppercase tracking-widest"
            >
              <BarChart2 className="w-4 h-4" />
              Analytics
            </Link>
            <div className="text-sm font-medium text-zinc-500 uppercase tracking-widest hidden sm:block">
              {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
        </header>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-7 lg:gap-10 2xl:gap-12 mb-12">
          <PushupCard
            balance={cumulativeBalance}
            cigarettes={todayRecord.cigarettes}
            exercises={todayRecord.exercises}
            onCigarette={handleCigarette}
            onExercise={handleExercise}
            isAuthed={isAuthed}
          />
          <FocusCard
            todayMinutes={displayFocusMinutesToday}
            weeklyAverage={calculateWeeklyAverage('focus_minutes')}
            monthlyAverage={calculateMonthlyAverage('focus_minutes')}
            onAddFocus={handleAddFocus}
            isAuthed={isAuthed}
          />
          <TaskCard
            todayTasks={displayTasksCompletedToday}
            weeklyTotal={calculateTotal('tasks_completed', 7)}
            monthlyTotal={calculateTotal('tasks_completed', 30)}
            onAddTask={handleAddTask}
            isAuthed={isAuthed}
          />
          <TokenCard
            todayTotal={todayTokens}
            todayClaude={todayClaude}
            todayCodex={todayCodex}
            weeklyAverage={tokensWeeklyAverage}
            monthlyAverage={tokensMonthlyAverage}
          />
        </div>

        {/* Floating Reward Vault Widget */}
        <FloatingVault records={records} todayRecord={todayRecord} cumulativeBalance={cumulativeBalance} isAuthed={isAuthed} />
      </div>
    </main>
  );
}

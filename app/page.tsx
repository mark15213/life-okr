'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PushupCard from '@/components/PushupCard';
import FocusCard from '@/components/FocusCard';
import TaskCard from '@/components/TaskCard';
import TokenCard from '@/components/TokenCard';
import FloatingVault from '@/components/FloatingVault';
import useSWR from 'swr';
import { DailyRecord, TokenUsageRow } from '@/lib/db';
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
    const weekRecords = records.slice(0, 7);
    if (weekRecords.length === 0) return 0;
    const sum = weekRecords.reduce((acc, r) => acc + (r[field] as number), 0);
    return Math.round(sum / weekRecords.length);
  };

  const calculateMonthlyAverage = (field: keyof DailyRecord) => {
    const monthRecords = records.slice(0, 30);
    if (monthRecords.length === 0) return 0;
    const sum = monthRecords.reduce((acc, r) => acc + (r[field] as number), 0);
    return Math.round(sum / monthRecords.length);
  };

  const calculateTotal = (field: keyof DailyRecord, days: number) => {
    const selectedRecords = records.slice(0, days);
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
    <main className="min-h-screen bg-zinc-50 relative overflow-hidden font-sans text-zinc-900 selection:bg-zinc-200">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03] mix-blend-multiply pointer-events-none" />
      <div className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] rounded-full bg-gradient-to-br from-blue-100/40 to-transparent blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-gradient-to-tl from-stone-200/50 to-transparent blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 px-4 sm:px-8 py-12 md:py-20">
        {/* Header */}
        <header className="mb-16 flex items-end justify-between border-b border-zinc-200 pb-6">
          <div>
            <h1 className="text-5xl md:text-6xl tracking-tighter text-zinc-900 drop-shadow-sm font-bold" style={{ fontFamily: 'var(--font-newspaper)', letterSpacing: '-0.02em' }}>
              Hustle.
            </h1>
          </div>
          <div className="flex items-center gap-6">
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
          <PushupCard
            balance={cumulativeBalance}
            cigarettes={todayRecord.cigarettes}
            exercises={todayRecord.exercises}
            onCigarette={handleCigarette}
            onExercise={handleExercise}
            isAuthed={isAuthed}
          />
          <FocusCard
            todayMinutes={todayRecord.focus_minutes}
            weeklyAverage={calculateWeeklyAverage('focus_minutes')}
            monthlyAverage={calculateMonthlyAverage('focus_minutes')}
            onAddFocus={handleAddFocus}
            isAuthed={isAuthed}
          />
          <TaskCard
            todayTasks={todayRecord.tasks_completed}
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

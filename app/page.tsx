'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PushupCard from '@/components/PushupCard';
import FocusCard from '@/components/FocusCard';
import TaskCard from '@/components/TaskCard';
import { DailyRecord } from '@/lib/db';
import { BarChart2 } from 'lucide-react';

export default function Home() {
  const [todayRecord, setTodayRecord] = useState<DailyRecord | null>(null);
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [todayRes, recordsRes] = await Promise.all([
        fetch('/api/records/today'),
        fetch('/api/records?days=30'),
      ]);

      const todayData = await todayRes.json();
      const recordsData = await recordsRes.json();

      setTodayRecord(todayData.record);
      setRecords(recordsData.records);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCigarette = async () => {
    await fetch('/api/records/cigarette', { method: 'POST' });
    await fetchData();
  };

  const handleExercise = async () => {
    await fetch('/api/records/exercise', { method: 'POST' });
    await fetchData();
  };

  const handleAddFocus = async (minutes: number) => {
    await fetch('/api/records/focus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minutes }),
    });
    await fetchData();
  };

  const handleAddTask = async () => {
    await fetch('/api/records/task', { method: 'POST' });
    await fetchData();
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
      {/* Premium Texture & Subtle Mesh Gradients */}
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03] mix-blend-multiply pointer-events-none" />
      <div className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] rounded-full bg-gradient-to-br from-blue-100/40 to-transparent blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-gradient-to-tl from-stone-200/50 to-transparent blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 px-4 sm:px-8 py-12 md:py-20">
        {/* Minimal & Elegant Header */}
        <header className="mb-16 flex items-end justify-between border-b border-zinc-200 pb-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-zinc-900">
              Data Panel
            </h1>
          </div>
          <div className="flex items-center gap-6">
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

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          <PushupCard
            balance={todayRecord.pushup_balance}
            cigarettes={todayRecord.cigarettes}
            exercises={todayRecord.exercises}
            onCigarette={handleCigarette}
            onExercise={handleExercise}
          />
          <FocusCard
            todayMinutes={todayRecord.focus_minutes}
            weeklyAverage={calculateWeeklyAverage('focus_minutes')}
            monthlyAverage={calculateMonthlyAverage('focus_minutes')}
            onAddFocus={handleAddFocus}
          />
          <TaskCard
            todayTasks={todayRecord.tasks_completed}
            weeklyTotal={calculateTotal('tasks_completed', 7)}
            monthlyTotal={calculateTotal('tasks_completed', 30)}
            onAddTask={handleAddTask}
          />
        </div>
      </div>
    </main>
  );
}

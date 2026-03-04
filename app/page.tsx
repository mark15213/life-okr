'use client';

import { useEffect, useState } from 'react';
import PushupCard from '@/components/PushupCard';
import FocusCard from '@/components/FocusCard';
import TaskCard from '@/components/TaskCard';
import TrendChart from '@/components/TrendChart';
import { DailyRecord } from '@/lib/db';

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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
        <div className="text-2xl font-bold text-gray-600">加载中...</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-800 mb-2">🎯 人生看板</h1>
          <p className="text-gray-600">追踪你的成长，见证每一天的进步</p>
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

        {/* Trend Chart */}
        <TrendChart records={records} />
      </div>
    </main>
  );
}

'use client';

import { useState } from 'react';

interface TaskCardProps {
  todayTasks: number;
  weeklyTotal: number;
  monthlyTotal: number;
  onAddTask: () => Promise<void>;
}

export default function TaskCard({
  todayTasks,
  weeklyTotal,
  monthlyTotal,
  onAddTask,
}: TaskCardProps) {
  const [loading, setLoading] = useState(false);

  const handleAddTask = async () => {
    setLoading(true);
    await onAddTask();
    setLoading(false);
  };

  return (
    <div className="rounded-3xl p-8 bg-gradient-to-br from-purple-500 to-pink-600 border-4 border-purple-400 shadow-2xl shadow-purple-500/50">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="text-5xl mb-3">✅</div>
        <h2 className="text-white text-xl font-semibold">任务完成</h2>
      </div>

      {/* Today's Task Count */}
      <div className="text-center mb-6">
        <div className="text-6xl font-bold text-white mb-2 animate-bounce">
          {todayTasks}
        </div>
        <div className="text-purple-100 text-sm">今日完成</div>
      </div>

      {/* Add Task Button */}
      <button
        onClick={handleAddTask}
        disabled={loading}
        className="w-full bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-bold py-4 px-6 rounded-2xl shadow-lg transform hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed mb-6"
      >
        <span className="text-2xl mr-2">➕</span>
        <span>完成一个任务</span>
      </button>

      {/* Statistics */}
      <div className="bg-white/20 rounded-xl p-4 text-white">
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold">{weeklyTotal}</div>
            <div className="text-xs">本周完成</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{monthlyTotal}</div>
            <div className="text-xs">本月完成</div>
          </div>
        </div>
      </div>
    </div>
  );
}

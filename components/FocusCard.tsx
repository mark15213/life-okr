'use client';

import { useState } from 'react';

interface FocusCardProps {
  todayMinutes: number;
  weeklyAverage: number;
  monthlyAverage: number;
  onAddFocus: (minutes: number) => Promise<void>;
}

export default function FocusCard({
  todayMinutes,
  weeklyAverage,
  monthlyAverage,
  onAddFocus,
}: FocusCardProps) {
  const [minutes, setMinutes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseInt(minutes);
    if (value > 0) {
      setLoading(true);
      await onAddFocus(value);
      setMinutes('');
      setLoading(false);
    }
  };

  const formatTime = (mins: number) => {
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}:${remainingMins.toString().padStart(2, '0')}`;
  };

  return (
    <div className="rounded-3xl p-8 bg-gradient-to-br from-cyan-500 to-blue-600 border-4 border-cyan-400 shadow-2xl shadow-cyan-500/50">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="text-5xl mb-3">⏱️</div>
        <h2 className="text-white text-xl font-semibold">专注时间</h2>
      </div>

      {/* Today's Focus Time */}
      <div className="text-center mb-6">
        <div className="text-6xl font-bold text-white mb-2">
          {formatTime(todayMinutes)}
        </div>
        <div className="text-cyan-100 text-sm">今日累计</div>
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex gap-2">
          <input
            type="number"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="输入分钟数"
            min="1"
            className="flex-1 px-4 py-3 rounded-xl text-gray-800 font-semibold text-center focus:outline-none focus:ring-4 focus:ring-cyan-300"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !minutes}
            className="bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-bold px-6 py-3 rounded-xl shadow-lg transform hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            添加
          </button>
        </div>
      </form>

      {/* Statistics */}
      <div className="bg-white/20 rounded-xl p-4 text-white">
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold">{formatTime(weeklyAverage)}</div>
            <div className="text-xs">本周平均</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{formatTime(monthlyAverage)}</div>
            <div className="text-xs">本月平均</div>
          </div>
        </div>
      </div>
    </div>
  );
}
'use client';

import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { DailyRecord } from '@/lib/db';

interface TrendChartProps {
  records: DailyRecord[];
}

type TimeRange = 7 | 30;

export default function TrendChart({ records }: TrendChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>(7);

  const chartData = records
    .slice(0, timeRange)
    .reverse()
    .map((record) => ({
      date: format(new Date(record.date), 'MM/dd'),
      俯卧撑余额: record.pushup_balance,
      专注时长: record.focus_minutes,
      完成任务: record.tasks_completed,
    }));

  return (
    <div className="rounded-3xl p-8 bg-white border-4 border-gray-200 shadow-2xl">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">📊 数据趋势</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setTimeRange(7)}
            className={`px-4 py-2 rounded-lg font-semibold transition-all ${
              timeRange === 7
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            7天
          </button>
          <button
            onClick={() => setTimeRange(30)}
            className={`px-4 py-2 rounded-lg font-semibold transition-all ${
              timeRange === 30
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            30天
          </button>
        </div>
      </div>

      {/* Charts */}
      <div className="space-y-8">
        {/* Pushup Balance Chart */}
        <div>
          <h3 className="text-lg font-semibold text-gray-700 mb-3">俯卧撑余额</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="俯卧撑余额"
                stroke="#f59e0b"
                strokeWidth={3}
                dot={{ fill: '#f59e0b', r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Focus Time Chart */}
        <div>
          <h3 className="text-lg font-semibold text-gray-700 mb-3">专注时长（分钟）</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="专注时长"
                stroke="#06b6d4"
                strokeWidth={3}
                dot={{ fill: '#06b6d4', r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Tasks Chart */}
        <div>
          <h3 className="text-lg font-semibold text-gray-700 mb-3">完成任务数</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="完成任务"
                stroke="#a855f7"
                strokeWidth={3}
                dot={{ fill: '#a855f7', r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

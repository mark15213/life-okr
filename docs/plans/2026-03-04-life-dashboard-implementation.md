# Life Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a personal life tracking dashboard with push-up balance, focus time, and task completion tracking, featuring a "Monopoly-style" wealth level system.

**Architecture:** Next.js 14 full-stack app with App Router, API routes for data operations, Vercel Postgres for storage, and Recharts for trend visualization. No authentication needed (single user).

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, Recharts, Vercel Postgres, @vercel/postgres

---

## Task 1: Project Initialization

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.js`
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Create: `.gitignore`
- Create: `.env.local`

**Step 1: Initialize Next.js project**

Run: `npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*"`

Choose options:
- TypeScript: Yes
- ESLint: Yes
- Tailwind CSS: Yes
- App Router: Yes
- Import alias: @/*

**Step 2: Install dependencies**

Run: `npm install @vercel/postgres recharts date-fns`
Run: `npm install -D @types/node`

**Step 3: Create environment file**

Create `.env.local`:
```
POSTGRES_URL="your-postgres-url"
POSTGRES_PRISMA_URL="your-prisma-url"
POSTGRES_URL_NON_POOLING="your-non-pooling-url"
POSTGRES_USER="your-user"
POSTGRES_HOST="your-host"
POSTGRES_PASSWORD="your-password"
POSTGRES_DATABASE="your-database"
```

**Step 4: Commit**

```bash
git add .
git commit -m "chore: initialize Next.js project with TypeScript and Tailwind"
```

---

## Task 2: Database Setup

**Files:**
- Create: `lib/db.ts`
- Create: `scripts/init-db.sql`

**Step 1: Create database connection utility**

Create `lib/db.ts`:
```typescript
import { sql } from '@vercel/postgres';

export interface DailyRecord {
  id: number;
  date: string;
  cigarettes: number;
  exercises: number;
  pushup_balance: number;
  focus_minutes: number;
  tasks_completed: number;
  created_at: Date;
  updated_at: Date;
}

export async function getTodayRecord(): Promise<DailyRecord | null> {
  const today = new Date().toISOString().split('T')[0];
  const { rows } = await sql<DailyRecord>`
    SELECT * FROM daily_records WHERE date = ${today}
  `;
  return rows[0] || null;
}

export async function getRecords(days: number = 7): Promise<DailyRecord[]> {
  const { rows } = await sql<DailyRecord>`
    SELECT * FROM daily_records
    ORDER BY date DESC
    LIMIT ${days}
  `;
  return rows;
}

export async function ensureTodayRecord(): Promise<DailyRecord> {
  const today = new Date().toISOString().split('T')[0];

  const { rows } = await sql<DailyRecord>`
    INSERT INTO daily_records (date, cigarettes, exercises, pushup_balance, focus_minutes, tasks_completed)
    VALUES (${today}, 0, 0, 0, 0, 0)
    ON CONFLICT (date) DO UPDATE SET updated_at = NOW()
    RETURNING *
  `;

  return rows[0];
}
```

**Step 2: Create database initialization script**

Create `scripts/init-db.sql`:
```sql
CREATE TABLE IF NOT EXISTS daily_records (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  cigarettes INT DEFAULT 0,
  exercises INT DEFAULT 0,
  pushup_balance INT DEFAULT 0,
  focus_minutes INT DEFAULT 0,
  tasks_completed INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_records_date ON daily_records(date DESC);
```

**Step 3: Commit**

```bash
git add lib/db.ts scripts/init-db.sql
git commit -m "feat: add database connection and schema"
```

---

## Task 3: API Routes - Records Endpoints

**Files:**
- Create: `app/api/records/route.ts`
- Create: `app/api/records/today/route.ts`

**Step 1: Create GET /api/records endpoint**

Create `app/api/records/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getRecords } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '7');

    const records = await getRecords(days);

    return NextResponse.json({ records });
  } catch (error) {
    console.error('Error fetching records:', error);
    return NextResponse.json(
      { error: 'Failed to fetch records' },
      { status: 500 }
    );
  }
}
```

**Step 2: Create GET /api/records/today endpoint**

Create `app/api/records/today/route.ts`:
```typescript
import { NextResponse } from 'next/server';
import { getTodayRecord, ensureTodayRecord } from '@/lib/db';

export async function GET() {
  try {
    let record = await getTodayRecord();

    if (!record) {
      record = await ensureTodayRecord();
    }

    return NextResponse.json({ record });
  } catch (error) {
    console.error('Error fetching today record:', error);
    return NextResponse.json(
      { error: 'Failed to fetch today record' },
      { status: 500 }
    );
  }
}
```

**Step 3: Commit**

```bash
git add app/api/records/
git commit -m "feat: add records API endpoints"
```

---

## Task 4: API Routes - Cigarette Endpoint

**Files:**
- Create: `app/api/records/cigarette/route.ts`

**Step 1: Create POST /api/records/cigarette endpoint**

Create `app/api/records/cigarette/route.ts`:
```typescript
import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { ensureTodayRecord } from '@/lib/db';

export async function POST() {
  try {
    await ensureTodayRecord();

    const today = new Date().toISOString().split('T')[0];

    const { rows } = await sql`
      UPDATE daily_records
      SET
        cigarettes = cigarettes + 1,
        pushup_balance = pushup_balance + 100,
        updated_at = NOW()
      WHERE date = ${today}
      RETURNING *
    `;

    return NextResponse.json({ record: rows[0] });
  } catch (error) {
    console.error('Error recording cigarette:', error);
    return NextResponse.json(
      { error: 'Failed to record cigarette' },
      { status: 500 }
    );
  }
}
```

**Step 2: Commit**

```bash
git add app/api/records/cigarette/
git commit -m "feat: add cigarette recording endpoint"
```

---

## Task 5: API Routes - Exercise Endpoint

**Files:**
- Create: `app/api/records/exercise/route.ts`

**Step 1: Create POST /api/records/exercise endpoint**

Create `app/api/records/exercise/route.ts`:
```typescript
import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { ensureTodayRecord } from '@/lib/db';

export async function POST() {
  try {
    await ensureTodayRecord();

    const today = new Date().toISOString().split('T')[0];

    const { rows } = await sql`
      UPDATE daily_records
      SET
        exercises = exercises + 1,
        pushup_balance = pushup_balance - 100,
        updated_at = NOW()
      WHERE date = ${today}
      RETURNING *
    `;

    return NextResponse.json({ record: rows[0] });
  } catch (error) {
    console.error('Error recording exercise:', error);
    return NextResponse.json(
      { error: 'Failed to record exercise' },
      { status: 500 }
    );
  }
}
```

**Step 2: Commit**

```bash
git add app/api/records/exercise/
git commit -m "feat: add exercise recording endpoint"
```

---

## Task 6: API Routes - Focus Endpoint

**Files:**
- Create: `app/api/records/focus/route.ts`

**Step 1: Create POST /api/records/focus endpoint**

Create `app/api/records/focus/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { ensureTodayRecord } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { minutes } = await request.json();

    if (typeof minutes !== 'number' || minutes <= 0) {
      return NextResponse.json(
        { error: 'Invalid minutes value' },
        { status: 400 }
      );
    }

    await ensureTodayRecord();

    const today = new Date().toISOString().split('T')[0];

    const { rows } = await sql`
      UPDATE daily_records
      SET
        focus_minutes = focus_minutes + ${minutes},
        updated_at = NOW()
      WHERE date = ${today}
      RETURNING *
    `;

    return NextResponse.json({ record: rows[0] });
  } catch (error) {
    console.error('Error recording focus time:', error);
    return NextResponse.json(
      { error: 'Failed to record focus time' },
      { status: 500 }
    );
  }
}
```

**Step 2: Commit**

```bash
git add app/api/records/focus/
git commit -m "feat: add focus time recording endpoint"
```

---

## Task 7: API Routes - Task Endpoint

**Files:**
- Create: `app/api/records/task/route.ts`

**Step 1: Create POST /api/records/task endpoint**

Create `app/api/records/task/route.ts`:
```typescript
import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { ensureTodayRecord } from '@/lib/db';

export async function POST() {
  try {
    await ensureTodayRecord();

    const today = new Date().toISOString().split('T')[0];

    const { rows } = await sql`
      UPDATE daily_records
      SET
        tasks_completed = tasks_completed + 1,
        updated_at = NOW()
      WHERE date = ${today}
      RETURNING *
    `;

    return NextResponse.json({ record: rows[0] });
  } catch (error) {
    console.error('Error recording task:', error);
    return NextResponse.json(
      { error: 'Failed to record task' },
      { status: 500 }
    );
  }
}
```

**Step 2: Commit**

```bash
git add app/api/records/task/
git commit -m "feat: add task recording endpoint"
```

---

## Task 8: Wealth Level Utility

**Files:**
- Create: `lib/wealth-levels.ts`

**Step 1: Create wealth level utility**

Create `lib/wealth-levels.ts`:
```typescript
export interface WealthLevel {
  name: string;
  emoji: string;
  minBalance: number;
  maxBalance: number;
  theme: {
    gradient: string;
    border: string;
    glow: string;
  };
}

export const WEALTH_LEVELS: WealthLevel[] = [
  {
    name: '小金库',
    emoji: '💰',
    minBalance: 0,
    maxBalance: -500,
    theme: {
      gradient: 'from-amber-600 to-amber-800',
      border: 'border-amber-500',
      glow: 'shadow-amber-500/50',
    },
  },
  {
    name: '储蓄达人',
    emoji: '💎',
    minBalance: -500,
    maxBalance: -1000,
    theme: {
      gradient: 'from-gray-400 to-gray-600',
      border: 'border-gray-400',
      glow: 'shadow-gray-400/50',
    },
  },
  {
    name: '理财高手',
    emoji: '🏆',
    minBalance: -1000,
    maxBalance: -2000,
    theme: {
      gradient: 'from-yellow-400 to-yellow-600',
      border: 'border-yellow-400',
      glow: 'shadow-yellow-400/50',
    },
  },
  {
    name: '财富自由',
    emoji: '👑',
    minBalance: -2000,
    maxBalance: -5000,
    theme: {
      gradient: 'from-purple-500 to-yellow-500',
      border: 'border-purple-400',
      glow: 'shadow-purple-400/50',
    },
  },
  {
    name: '大富翁',
    emoji: '🎰',
    minBalance: -5000,
    maxBalance: -Infinity,
    theme: {
      gradient: 'from-pink-500 via-purple-500 to-blue-500',
      border: 'border-pink-400',
      glow: 'shadow-pink-400/50',
    },
  },
];

export function getWealthLevel(balance: number): WealthLevel {
  // Balance is negative when you can redeem
  for (const level of WEALTH_LEVELS) {
    if (balance <= level.minBalance && balance > level.maxBalance) {
      return level;
    }
  }

  // Default to first level if balance is positive (in debt)
  return WEALTH_LEVELS[0];
}

export function getProgressToNextLevel(balance: number): {
  current: WealthLevel;
  next: WealthLevel | null;
  progress: number;
  remaining: number;
} {
  const current = getWealthLevel(balance);
  const currentIndex = WEALTH_LEVELS.indexOf(current);
  const next = currentIndex < WEALTH_LEVELS.length - 1 ? WEALTH_LEVELS[currentIndex + 1] : null;

  if (!next) {
    return { current, next: null, progress: 100, remaining: 0 };
  }

  const rangeSize = current.minBalance - next.minBalance;
  const progressInRange = current.minBalance - balance;
  const progress = Math.min(100, (progressInRange / rangeSize) * 100);
  const remaining = next.minBalance - balance;

  return { current, next, progress, remaining };
}
```

**Step 2: Commit**

```bash
git add lib/wealth-levels.ts
git commit -m "feat: add wealth level system utility"
```

---

## Task 9: Pushup Card Component

**Files:**
- Create: `components/PushupCard.tsx`

**Step 1: Create pushup card component**

Create `components/PushupCard.tsx`:
```typescript
'use client';

import { useState } from 'react';
import { getWealthLevel, getProgressToNextLevel } from '@/lib/wealth-levels';

interface PushupCardProps {
  balance: number;
  cigarettes: number;
  exercises: number;
  onCigarette: () => Promise<void>;
  onExercise: () => Promise<void>;
}

export default function PushupCard({
  balance,
  cigarettes,
  exercises,
  onCigarette,
  onExercise,
}: PushupCardProps) {
  const [loading, setLoading] = useState(false);

  const handleCigarette = async () => {
    setLoading(true);
    await onCigarette();
    setLoading(false);
  };

  const handleExercise = async () => {
    setLoading(true);
    await onExercise();
    setLoading(false);
  };

  const { current, next, progress, remaining } = getProgressToNextLevel(balance);
  const redeemableAmount = balance < 0 ? Math.abs(balance) : 0;

  return (
    <div
      className={`relative rounded-3xl p-8 bg-gradient-to-br ${current.theme.gradient} border-4 ${current.theme.border} shadow-2xl ${current.theme.glow} transition-all duration-500`}
    >
      {/* Level Badge */}
      <div className="absolute -top-4 -right-4 bg-white rounded-full px-6 py-3 shadow-lg border-4 border-white">
        <span className="text-3xl">{current.emoji}</span>
        <span className="ml-2 font-bold text-gray-800">{current.name}</span>
      </div>

      {/* Balance Display */}
      <div className="text-center mb-6">
        <h2 className="text-white text-xl font-semibold mb-2">俯卧撑余额</h2>
        <div className="text-6xl font-bold text-white mb-2 animate-bounce">
          {balance}
        </div>
        {redeemableAmount > 0 && (
          <div className="text-2xl text-yellow-300 font-semibold animate-pulse">
            💰 可兑换 ¥{redeemableAmount}
          </div>
        )}
      </div>

      {/* Progress to Next Level */}
      {next && (
        <div className="mb-6">
          <div className="flex justify-between text-white text-sm mb-2">
            <span>距离 {next.emoji} {next.name}</span>
            <span>{Math.abs(remaining)} 俯卧撑</span>
          </div>
          <div className="w-full bg-white/30 rounded-full h-3 overflow-hidden">
            <div
              className="bg-white h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <button
          onClick={handleCigarette}
          disabled={loading}
          className="bg-red-500 hover:bg-red-600 text-white font-bold py-4 px-6 rounded-2xl shadow-lg transform hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="text-2xl mr-2">🚬</span>
          <span>抽烟 +100</span>
        </button>
        <button
          onClick={handleExercise}
          disabled={loading}
          className="bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-6 rounded-2xl shadow-lg transform hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="text-2xl mr-2">💪</span>
          <span>运动 -100</span>
        </button>
      </div>

      {/* Today's Stats */}
      <div className="bg-white/20 rounded-xl p-4 text-white">
        <div className="text-sm font-semibold mb-2">今日记录</div>
        <div className="flex justify-around">
          <div className="text-center">
            <div className="text-2xl font-bold">{cigarettes}</div>
            <div className="text-xs">支烟</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{exercises}</div>
            <div className="text-xs">次运动</div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add components/PushupCard.tsx
git commit -m "feat: add pushup card component with wealth levels"
```

---

## Task 10: Focus Card Component

**Files:**
- Create: `components/FocusCard.tsx`

**Step 1: Create focus card component**

Create `components/FocusCard.tsx`:
```typescript
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
```

**Step 2: Commit**

```bash
git add components/FocusCard.tsx
git commit -m "feat: add focus time card component"
```

---

## Task 11: Task Card Component

**Files:**
- Create: `components/TaskCard.tsx`

**Step 1: Create task card component**

Create `components/TaskCard.tsx`:
```typescript
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
```

**Step 2: Commit**

```bash
git add components/TaskCard.tsx
git commit -m "feat: add task completion card component"
```

---

## Task 12: Trend Chart Component

**Files:**
- Create: `components/TrendChart.tsx`

**Step 1: Create trend chart component**

Create `components/TrendChart.tsx`:
```typescript
'use client';

import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
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
```

**Step 2: Commit**

```bash
git add components/TrendChart.tsx
git commit -m "feat: add trend chart component with 7/30 day views"
```

---

## Task 13: Main Dashboard Page

**Files:**
- Create: `app/page.tsx`
- Modify: `app/layout.tsx`

**Step 1: Create main dashboard page**

Create `app/page.tsx`:
```typescript
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
```

**Step 2: Update layout**

Modify `app/layout.tsx`:
```typescript
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: '人生看板 - Life Dashboard',
  description: '追踪你的成长，见证每一天的进步',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
```

**Step 3: Commit**

```bash
git add app/page.tsx app/layout.tsx
git commit -m "feat: add main dashboard page with all components"
```

---

## Task 14: Database Initialization Script

**Files:**
- Create: `scripts/setup-db.ts`
- Modify: `package.json`

**Step 1: Create setup script**

Create `scripts/setup-db.ts`:
```typescript
import { sql } from '@vercel/postgres';

async function setupDatabase() {
  try {
    console.log('Creating daily_records table...');

    await sql`
      CREATE TABLE IF NOT EXISTS daily_records (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL UNIQUE,
        cigarettes INT DEFAULT 0,
        exercises INT DEFAULT 0,
        pushup_balance INT DEFAULT 0,
        focus_minutes INT DEFAULT 0,
        tasks_completed INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_daily_records_date ON daily_records(date DESC)
    `;

    console.log('✅ Database setup complete!');
  } catch (error) {
    console.error('❌ Error setting up database:', error);
    process.exit(1);
  }
}

setupDatabase();
```

**Step 2: Add script to package.json**

Modify `package.json` to add the setup script:
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "setup-db": "tsx scripts/setup-db.ts"
  }
}
```

**Step 3: Install tsx for running TypeScript scripts**

Run: `npm install -D tsx`

**Step 4: Commit**

```bash
git add scripts/setup-db.ts package.json
git commit -m "feat: add database setup script"
```

---

## Task 15: README and Documentation

**Files:**
- Create: `README.md`
- Create: `.env.example`

**Step 1: Create README**

Create `README.md`:
```markdown
# 🎯 人生看板 (Life Dashboard)

一个个人生活追踪看板系统，通过三个核心指标来量化和激励个人成长。

## 核心功能

### 💪 俯卧撑余额系统
- 抽一支烟：+100 俯卧撑
- 运动一次：-100 俯卧撑
- 余额为负数时可兑换为等额现金奖励
- "大富翁"式财富等级系统

### ⏱️ 专注时间追踪
- 手动记录每日专注时长
- 查看本周/本月平均专注时长

### ✅ 任务完成追踪
- 记录每日完成任务数
- 查看本周/本月完成任务总数

### 📊 数据趋势
- 7天/30天数据趋势图表
- 可视化你的进步轨迹

## 技术栈

- **框架**: Next.js 14 (App Router)
- **语言**: TypeScript
- **样式**: Tailwind CSS
- **图表**: Recharts
- **数据库**: Vercel Postgres
- **部署**: Vercel

## 开始使用

### 1. 安装依赖

\`\`\`bash
npm install
\`\`\`

### 2. 配置环境变量

复制 `.env.example` 到 `.env.local` 并填入你的 Vercel Postgres 连接信息：

\`\`\`bash
cp .env.example .env.local
\`\`\`

### 3. 初始化数据库

\`\`\`bash
npm run setup-db
\`\`\`

### 4. 启动开发服务器

\`\`\`bash
npm run dev
\`\`\`

访问 [http://localhost:3000](http://localhost:3000) 查看应用。

## 部署到 Vercel

1. 将代码推送到 GitHub
2. 在 Vercel 导入项目
3. 添加 Vercel Postgres 数据库
4. 运行 `npm run setup-db` 初始化数据库
5. 部署完成！

## 财富等级系统

| 余额范围 | 等级 | 主题 |
|---------|------|------|
| 0 ~ -500 | 💰 小金库 | 铜色主题 |
| -500 ~ -1000 | 💎 储蓄达人 | 银色主题 |
| -1000 ~ -2000 | 🏆 理财高手 | 金色主题 |
| -2000 ~ -5000 | 👑 财富自由 | 紫金主题 |
| -5000以上 | 🎰 大富翁 | 彩虹特效 |

## License

MIT
```

**Step 2: Create .env.example**

Create `.env.example`:
```
POSTGRES_URL="your-postgres-url"
POSTGRES_PRISMA_URL="your-prisma-url"
POSTGRES_URL_NON_POOLING="your-non-pooling-url"
POSTGRES_USER="your-user"
POSTGRES_HOST="your-host"
POSTGRES_PASSWORD="your-password"
POSTGRES_DATABASE="your-database"
```

**Step 3: Commit**

```bash
git add README.md .env.example
git commit -m "docs: add README and environment example"
```

---

## Task 16: Final Testing and Deployment

**Step 1: Test locally**

Run: `npm run dev`

Test all features:
- ✅ Click "+抽烟" button and verify balance increases by 100
- ✅ Click "+运动" button and verify balance decreases by 100
- ✅ Add focus time and verify it's recorded
- ✅ Add task and verify counter increases
- ✅ Check wealth level changes as balance changes
- ✅ Switch between 7-day and 30-day chart views
- ✅ Verify all data persists after page refresh

**Step 2: Build for production**

Run: `npm run build`

Expected: Build completes without errors

**Step 3: Deploy to Vercel**

1. Push code to GitHub
2. Import project in Vercel
3. Add Vercel Postgres database
4. Set environment variables
5. Deploy

**Step 4: Initialize production database**

After deployment, run: `npm run setup-db` (with production env vars)

**Step 5: Final commit**

```bash
git add .
git commit -m "chore: ready for production deployment"
```

---

## Summary

This implementation plan creates a complete life dashboard with:

1. ✅ Next.js 14 full-stack application
2. ✅ Three tracking cards (pushups, focus, tasks)
3. ✅ Wealth level system with visual themes
4. ✅ Trend charts with 7/30 day views
5. ✅ Vercel Postgres database
6. ✅ Responsive design with Tailwind CSS
7. ✅ Ready for Vercel deployment

**Key Features:**
- No authentication (single user)
- Real-time data updates
- Animated UI with playful design
- Progress tracking and visualization
- Cloud-based data storage

**Next Steps After Implementation:**
- Deploy to Vercel
- Initialize database
- Start tracking your life!

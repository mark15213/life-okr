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

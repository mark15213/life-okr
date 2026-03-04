import { sql } from '@vercel/postgres';

const DEFAULT_DAYS = 7;

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
  try {
    const today = new Date().toISOString().split('T')[0];
    const { rows } = await sql<DailyRecord>`
      SELECT * FROM daily_records WHERE date = ${today}
    `;
    return rows[0] || null;
  } catch (error) {
    console.error('Error fetching today\'s record:', error);
    throw new Error('Failed to fetch today\'s record');
  }
}

export async function getRecords(days: number = DEFAULT_DAYS): Promise<DailyRecord[]> {
  try {
    if (!Number.isInteger(days) || days <= 0) {
      throw new Error('Days parameter must be a positive integer');
    }

    const { rows } = await sql<DailyRecord>`
      SELECT * FROM daily_records
      ORDER BY date DESC
      LIMIT ${days}
    `;
    return rows;
  } catch (error) {
    console.error('Error fetching records:', error);
    throw new Error('Failed to fetch records');
  }
}

export async function ensureTodayRecord(): Promise<DailyRecord> {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { rows } = await sql<DailyRecord>`
      INSERT INTO daily_records (date, cigarettes, exercises, pushup_balance, focus_minutes, tasks_completed)
      VALUES (${today}, 0, 0, 0, 0, 0)
      ON CONFLICT (date) DO UPDATE SET updated_at = NOW()
      RETURNING *
    `;

    if (!rows[0]) {
      throw new Error('Failed to create or retrieve today\'s record');
    }

    return rows[0];
  } catch (error) {
    console.error('Error ensuring today\'s record:', error);
    throw new Error('Failed to ensure today\'s record');
  }
}

import postgres from 'postgres';

const DEFAULT_DAYS = 7;

// Initialize database connection
export const sql = postgres(process.env.POSTGRES_URL!);

export interface DailyRecord {
  id: number;
  date: string;
  cigarettes: number;
  exercises: number;
  pushup_balance: number;
  focus_minutes: number;
  tasks_completed: number;
  calories_burned: number;
  created_at: Date;
  updated_at: Date;
}

export async function getTodayRecord(): Promise<DailyRecord | null> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const rows = await sql`
      SELECT * FROM daily_records WHERE date = ${today}
    `;
    return (rows[0] as unknown as DailyRecord) || null;
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

    const rows = await sql`
      SELECT * FROM daily_records
      ORDER BY date DESC
      LIMIT ${days}
    `;
    return rows as unknown as DailyRecord[];
  } catch (error) {
    console.error('Error fetching records:', error);
    throw new Error('Failed to fetch records');
  }
}

export async function ensureTodayRecord(): Promise<DailyRecord> {
  try {
    const today = new Date().toISOString().split('T')[0];

    const rows = await sql`
      INSERT INTO daily_records (date, cigarettes, exercises, pushup_balance, focus_minutes, tasks_completed, calories_burned)
      VALUES (${today}, 0, 0, 0, 0, 0, 0)
      ON CONFLICT (date) DO UPDATE SET updated_at = NOW()
      RETURNING *
    `;

    if (!rows[0]) {
      throw new Error('Failed to create or retrieve today\'s record');
    }

    return rows[0] as unknown as DailyRecord;
  } catch (error) {
    console.error('Error ensuring today\'s record:', error);
    throw new Error('Failed to ensure today\'s record');
  }
}

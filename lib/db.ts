import postgres from 'postgres';

const DEFAULT_DAYS = 7;

// Initialize database connection
// In development, prevent hot reloads from creating multiple new connections
const globalForPostgres = globalThis as unknown as {
  postgresInstance: postgres.Sql | undefined;
};

export const sql = globalForPostgres.postgresInstance ?? postgres(process.env.POSTGRES_URL!, {
  ssl: process.env.NODE_ENV === 'production' ? 'require' : false
});

if (process.env.NODE_ENV !== 'production') globalForPostgres.postgresInstance = sql;

export interface DailyRecord {
  id: number;
  date: string;
  cigarettes: number;
  exercises: number;
  pushup_balance: number;
  focus_minutes: number;
  tasks_completed: number;
  calories_burned: number;
  focus_minutes_ticktick: number;
  tasks_completed_ticktick: number;
  ticktick_synced_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// postgres-js returns DATE columns as JS Date objects. Our DailyRecord.date
// is typed as `string` ("YYYY-MM-DD") and several callers (analytics token
// join, FloatingVault equality check) depend on the YYYY-MM-DD shape.
// Normalize at the boundary so the runtime shape matches the type.
function normalizeRecord(row: Record<string, unknown>): DailyRecord {
  const raw = row.date;
  const date = typeof raw === 'string' ? raw.slice(0, 10) : (raw as Date).toISOString().slice(0, 10);
  return { ...(row as unknown as DailyRecord), date };
}

export async function getTodayRecord(): Promise<DailyRecord | null> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const rows = await sql`
      SELECT * FROM daily_records WHERE date = ${today}
    `;
    return rows[0] ? normalizeRecord(rows[0] as Record<string, unknown>) : null;
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
    return rows.map((r) => normalizeRecord(r as Record<string, unknown>));
  } catch (error) {
    console.error('Error fetching records:', error);
    throw new Error(`Failed to fetch records: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function ensureTodayRecord(): Promise<DailyRecord> {
  const today = new Date().toISOString().split('T')[0];
  return ensureRecord(today);
}

export async function ensureRecord(date: string): Promise<DailyRecord> {
  try {
    const rows = await sql`
      INSERT INTO daily_records (date, cigarettes, exercises, pushup_balance, focus_minutes, tasks_completed, calories_burned)
      VALUES (${date}, 0, 0, 0, 0, 0, 0)
      ON CONFLICT (date) DO UPDATE SET updated_at = NOW()
      RETURNING *
    `;

    if (!rows[0]) {
      throw new Error(`Failed to create or retrieve record for date: ${date}`);
    }

    return normalizeRecord(rows[0] as Record<string, unknown>);
  } catch (error) {
    console.error(`Error ensuring record for date: ${date}`, error);
    throw new Error(`Failed to ensure record for ${date}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function getCumulativePushupBalance(): Promise<number> {
  try {
    const rows = await sql`
      SELECT SUM(pushup_balance) as total FROM daily_records
    `;
    return Number(rows[0]?.total || 0);
  } catch (error) {
    console.error('Error fetching cumulative pushup balance:', error);
    return 0;
  }
}

export interface TokenUsageRow {
  date: string;
  tool: 'claude_code' | 'codex';
  total_tokens: number;
  updated_at: Date;
}

export async function getTokenUsage(days: number = 30): Promise<TokenUsageRow[]> {
  if (!Number.isInteger(days) || days <= 0) {
    throw new Error('Days parameter must be a positive integer');
  }
  try {
    const rows = await sql`
      SELECT date, tool, total_tokens, updated_at
      FROM token_usage
      WHERE date >= CURRENT_DATE - (${days}::int - 1)
      ORDER BY date DESC, tool ASC
    `;
    return rows.map((r) => ({
      date: typeof r.date === 'string' ? r.date : (r.date as Date).toISOString().slice(0, 10),
      tool: r.tool as TokenUsageRow['tool'],
      total_tokens: Number(r.total_tokens),
      updated_at: r.updated_at as Date,
    }));
  } catch (error) {
    console.error('Error fetching token usage:', error);
    throw new Error(`Failed to fetch token usage: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function upsertTokenUsage(
  entries: Array<{ date: string; tool: 'claude_code' | 'codex'; total_tokens: number }>
): Promise<number> {
  if (entries.length === 0) return 0;
  try {
    const result = await sql`
      INSERT INTO token_usage ${sql(entries, 'date', 'tool', 'total_tokens')}
      ON CONFLICT (date, tool)
      DO UPDATE SET total_tokens = EXCLUDED.total_tokens, updated_at = NOW()
    `;
    return result.count ?? entries.length;
  } catch (error) {
    console.error('Error upserting token usage:', error);
    throw new Error(`Failed to upsert token usage: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function upsertTicktickSync(
  date: string,
  focusMinutes: number,
  tasksCompleted: number
): Promise<void> {
  try {
    await sql`
      INSERT INTO daily_records (date, focus_minutes_ticktick, tasks_completed_ticktick, ticktick_synced_at)
      VALUES (${date}, ${focusMinutes}, ${tasksCompleted}, NOW())
      ON CONFLICT (date) DO UPDATE SET
        focus_minutes_ticktick = EXCLUDED.focus_minutes_ticktick,
        tasks_completed_ticktick = EXCLUDED.tasks_completed_ticktick,
        ticktick_synced_at = NOW()
    `;
  } catch (error) {
    console.error(`Error upserting ticktick sync for ${date}:`, error);
    throw new Error(`Failed to upsert ticktick sync: ${error instanceof Error ? error.message : String(error)}`);
  }
}

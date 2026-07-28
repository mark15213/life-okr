import { NextResponse } from 'next/server';
import { ensureTodayRecord, sql } from '@/lib/db';
import { hasValidAuthSession } from '@/lib/auth';

export async function POST(request: Request) {
  if (!hasValidAuthSession(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // See focus/route.ts: use the ensured row's own date so this can't disagree with
    // ensureTodayRecord's APP_TZ notion of "today" on a UTC server.
    const { date: today } = await ensureTodayRecord();

    const rows = await sql`
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

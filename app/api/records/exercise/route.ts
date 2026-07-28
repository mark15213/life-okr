import { NextResponse } from 'next/server';
import { ensureTodayRecord, sql } from '@/lib/db';
import { hasValidAuthSession } from '@/lib/auth';

export async function POST(req: Request) {
  if (!hasValidAuthSession(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const calories = typeof body.calories === 'number' ? body.calories : 0;

    // See focus/route.ts: use the ensured row's own date so this can't disagree with
    // ensureTodayRecord's APP_TZ notion of "today" on a UTC server.
    const { date: today } = await ensureTodayRecord();

    const rows = await sql`
      UPDATE daily_records
      SET
        exercises = exercises + 1,
        pushup_balance = pushup_balance - 100,
        calories_burned = calories_burned + ${calories},
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

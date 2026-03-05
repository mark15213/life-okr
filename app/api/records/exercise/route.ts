import { NextResponse } from 'next/server';
import { ensureTodayRecord, sql } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const calories = typeof body.calories === 'number' ? body.calories : 0;

    await ensureTodayRecord();

    const today = new Date().toISOString().split('T')[0];

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

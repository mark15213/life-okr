import { NextRequest, NextResponse } from 'next/server';
import { ensureTodayRecord, sql } from '@/lib/db';
import { hasValidAuthSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  if (!hasValidAuthSession(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

    const rows = await sql`
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

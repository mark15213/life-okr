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

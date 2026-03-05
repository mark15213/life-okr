import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { ensureTodayRecord } from '@/lib/db';

const sql = neon(process.env.POSTGRES_URL!);

export async function POST() {
  try {
    await ensureTodayRecord();

    const today = new Date().toISOString().split('T')[0];

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

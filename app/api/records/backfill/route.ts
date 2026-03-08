import { NextResponse } from 'next/server';
import { ensureRecord, sql } from '@/lib/db';

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));

        // Validate date format (YYYY-MM-DD)
        const dateStr = body.date;
        if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            return NextResponse.json({ error: 'Invalid or missing date (must be YYYY-MM-DD)' }, { status: 400 });
        }

        const calories = typeof body.calories === 'number' ? body.calories : 0;
        const exercises = typeof body.exercises === 'number' ? body.exercises : 0;
        const focus = typeof body.focus === 'number' ? body.focus : 0;
        const tasks = typeof body.tasks === 'number' ? body.tasks : 0;

        if (calories === 0 && exercises === 0 && focus === 0 && tasks === 0) {
            return NextResponse.json({ error: 'No data provided to backfill.' }, { status: 400 });
        }

        // Ensure record exists for that date
        await ensureRecord(dateStr);

        const rows = await sql`
      UPDATE daily_records
      SET
        exercises = exercises + ${exercises},
        pushup_balance = pushup_balance - (${exercises} * 100),
        calories_burned = calories_burned + ${calories},
        focus_minutes = focus_minutes + ${focus},
        tasks_completed = tasks_completed + ${tasks},
        updated_at = NOW()
      WHERE date = ${dateStr}
      RETURNING *
    `;

        return NextResponse.json({ record: rows[0] });
    } catch (error) {
        console.error('Error recording backfill:', error);
        return NextResponse.json(
            { error: 'Failed to record backfill' },
            { status: 500 }
        );
    }
}

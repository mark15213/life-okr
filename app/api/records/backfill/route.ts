import { NextResponse } from 'next/server';
import { ensureRecord, sql, upsertTokenUsage } from '@/lib/db';
import { hasValidAuthSession } from '@/lib/auth';

// Backfilled workouts don't come with a remembered calorie count, so every one of them
// is priced at the same flat rate rather than asking for a number nobody can recall.
const CALORIES_PER_EXERCISE = 200;

export async function POST(req: Request) {
    if (!hasValidAuthSession(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json().catch(() => ({}));

        // Validate date format (YYYY-MM-DD)
        const dateStr = body.date;
        if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            return NextResponse.json({ error: 'Invalid or missing date (must be YYYY-MM-DD)' }, { status: 400 });
        }

        const exercises = typeof body.exercises === 'number' ? body.exercises : 0;
        const focus = typeof body.focus === 'number' ? body.focus : 0;
        const tasks = typeof body.tasks === 'number' ? body.tasks : 0;
        const calories = exercises * CALORIES_PER_EXERCISE;

        // Tokens are absent (not zero) when the field was left blank — an explicit 0 is a
        // valid write, since it corrects a day that was reported wrong.
        const hasTokens = body.tokens !== undefined && body.tokens !== null;
        if (hasTokens && (
            typeof body.tokens !== 'number' ||
            !Number.isInteger(body.tokens) ||
            body.tokens < 0
        )) {
            return NextResponse.json({ error: 'tokens must be a non-negative integer' }, { status: 400 });
        }
        const tokens: number | null = hasTokens ? body.tokens : null;

        const hasRecordData = exercises !== 0 || focus !== 0 || tasks !== 0;
        if (!hasRecordData && tokens === null) {
            return NextResponse.json({ error: 'No data provided to backfill.' }, { status: 400 });
        }

        let record = null;
        if (hasRecordData) {
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
            record = rows[0] ?? null;
        }

        // Unlike the daily_records columns above, this overwrites rather than adds: the
        // token reporter posts each day's absolute total, so a backfill has to speak the
        // same language or a later sync would disagree with it.
        if (tokens !== null) {
            await upsertTokenUsage([{ date: dateStr, tool: 'codex', total_tokens: tokens }]);
        }

        return NextResponse.json({ record, tokens });
    } catch (error) {
        console.error('Error recording backfill:', error);
        return NextResponse.json(
            { error: 'Failed to record backfill' },
            { status: 500 }
        );
    }
}

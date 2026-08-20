import { NextRequest, NextResponse } from 'next/server';
import { getRecords, getRecordsSince } from '@/lib/db';

export const dynamic = 'force-dynamic';

const MAX_DAYS = 365;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // `since` is the open-ended form: no row cap, because callers that accumulate over an
    // era (the vault) need every day in it, however many that has grown to.
    const since = searchParams.get('since');
    if (since) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) {
        return NextResponse.json(
          { error: 'Invalid since parameter: must be a YYYY-MM-DD date' },
          { status: 400 }
        );
      }
      return NextResponse.json({ records: await getRecordsSince(since) });
    }

    const daysParam = searchParams.get('days') || '7';
    const days = parseInt(daysParam);

    // Validate days parameter
    if (isNaN(days)) {
      return NextResponse.json(
        { error: 'Invalid days parameter: must be a number' },
        { status: 400 }
      );
    }

    // Check upper bound
    if (days > MAX_DAYS) {
      return NextResponse.json(
        { error: `Invalid days parameter: must not exceed ${MAX_DAYS}` },
        { status: 400 }
      );
    }

    const records = await getRecords(days);

    return NextResponse.json({ records });
  } catch (error) {
    console.error('Error fetching records:', error);
    return NextResponse.json(
      { error: 'Failed to fetch records' },
      { status: 500 }
    );
  }
}

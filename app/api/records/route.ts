import { NextRequest, NextResponse } from 'next/server';
import { getRecords } from '@/lib/db';

const MAX_DAYS = 365;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
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

import { NextResponse } from 'next/server';
import { getTodayRecord, ensureTodayRecord } from '@/lib/db';

export async function GET() {
  try {
    let record = await getTodayRecord();

    if (!record) {
      record = await ensureTodayRecord();
    }

    return NextResponse.json({ record });
  } catch (error) {
    console.error('Error fetching today record:', error);
    return NextResponse.json(
      { error: 'Failed to fetch today record' },
      { status: 500 }
    );
  }
}

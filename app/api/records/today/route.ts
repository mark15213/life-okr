import { NextResponse } from 'next/server';
import { getTodayRecord, ensureTodayRecord, getCumulativePushupBalance } from '@/lib/db';

export async function GET() {
  try {
    let record = await getTodayRecord();

    if (!record) {
      record = await ensureTodayRecord();
    }

    const cumulativePushupBalance = await getCumulativePushupBalance();

    return NextResponse.json({ record, cumulativePushupBalance });
  } catch (error) {
    console.error('Error fetching today record:', error);
    return NextResponse.json(
      { error: 'Failed to fetch today record' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { getTodayRecord, ensureTodayRecord, getCumulativePushupBalance } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    let [record, cumulativePushupBalance] = await Promise.all([
      getTodayRecord(),
      getCumulativePushupBalance()
    ]);

    if (!record) {
      record = await ensureTodayRecord();
    }

    return NextResponse.json({ record, cumulativePushupBalance });
  } catch (error) {
    console.error('Error fetching today record:', error);
    return NextResponse.json(
      { error: 'Failed to fetch today record' },
      { status: 500 }
    );
  }
}

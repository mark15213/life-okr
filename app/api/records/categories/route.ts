import { NextRequest, NextResponse } from 'next/server';
import { getCategoryStats, CategoryStatRow } from '@/lib/db';

export const dynamic = 'force-dynamic';

const MAX_DAYS = 365;

export async function GET(request: NextRequest) {
  try {
    const daysParam = request.nextUrl.searchParams.get('days') ?? '365';
    const days = parseInt(daysParam, 10);
    if (!Number.isFinite(days) || days <= 0) {
      return NextResponse.json({ error: 'invalid days parameter' }, { status: 400 });
    }
    if (days > MAX_DAYS) {
      return NextResponse.json({ error: `days must not exceed ${MAX_DAYS}` }, { status: 400 });
    }
    const rows: CategoryStatRow[] = await getCategoryStats(days);
    return NextResponse.json({ entries: rows });
  } catch (error) {
    console.error('Error in GET /api/records/categories:', error);
    return NextResponse.json({ error: 'failed to fetch category stats' }, { status: 500 });
  }
}

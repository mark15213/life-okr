import { NextResponse } from 'next/server';
import { hasValidAuthSession } from '@/lib/auth';

export function GET(request: Request) {
  return NextResponse.json({ authenticated: hasValidAuthSession(request) });
}

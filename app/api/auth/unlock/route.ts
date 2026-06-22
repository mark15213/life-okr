import { NextResponse } from 'next/server';
import {
  AUTH_COOKIE_NAME,
  createAuthSessionCookie,
  isAuthConfigured,
  verifyDashboardPasscode,
} from '@/lib/auth';

export async function POST(request: Request) {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      { error: 'Dashboard auth is not configured' },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => ({}));
  if (!verifyDashboardPasscode((body as { code?: unknown }).code)) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 401 });
  }

  const session = createAuthSessionCookie();
  if (!session) {
    return NextResponse.json(
      { error: 'Dashboard auth is not configured' },
      { status: 500 }
    );
  }

  const response = NextResponse.json({ authenticated: true });
  response.cookies.set(AUTH_COOKIE_NAME, session.value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: session.maxAge,
    expires: session.expiresAt,
  });

  return response;
}

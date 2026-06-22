import { createHmac, timingSafeEqual } from 'node:crypto';

export const AUTH_COOKIE_NAME = 'life-okr-session';

const DEV_PASSCODE = '5566';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function getDashboardPasscode(): string | null {
  if (process.env.DASHBOARD_PASSCODE) return process.env.DASHBOARD_PASSCODE;
  return process.env.NODE_ENV === 'production' ? null : DEV_PASSCODE;
}

function getAuthSecret(): string | null {
  return process.env.DASHBOARD_AUTH_SECRET ?? getDashboardPasscode();
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return timingSafeEqual(aBuffer, bBuffer);
}

function sign(value: string): string | null {
  const secret = getAuthSecret();
  if (!secret) return null;
  return createHmac('sha256', secret).update(value).digest('hex');
}

function getCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;

  for (const cookie of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = cookie.trim().split('=');
    if (rawName === name) {
      return rawValue.join('=') || null;
    }
  }

  return null;
}

export function isAuthConfigured(): boolean {
  return Boolean(getDashboardPasscode() && getAuthSecret());
}

export function verifyDashboardPasscode(code: unknown): boolean {
  const expected = getDashboardPasscode();
  if (!expected || typeof code !== 'string') return false;
  return safeEqual(code, expected);
}

export function createAuthSessionCookie(now = Date.now()) {
  const expiresAt = now + SESSION_TTL_MS;
  const expiresAtValue = String(expiresAt);
  const signature = sign(expiresAtValue);
  if (!signature) return null;

  return {
    value: `${expiresAtValue}.${signature}`,
    expiresAt: new Date(expiresAt),
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

export function hasValidAuthSession(request: Request): boolean {
  const cookieValue = getCookieValue(request.headers.get('cookie'), AUTH_COOKIE_NAME);
  if (!cookieValue) return false;

  const parts = cookieValue.split('.');
  if (parts.length !== 2) return false;

  const [expiresAtValue, providedSignature] = parts;
  const expiresAt = Number(expiresAtValue);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;

  const expectedSignature = sign(expiresAtValue);
  if (!expectedSignature) return false;

  return safeEqual(providedSignature, expectedSignature);
}

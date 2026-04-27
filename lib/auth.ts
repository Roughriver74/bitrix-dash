import { createHmac, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';

const COOKIE_NAME = 'bx_admin';
const COOKIE_MAX_AGE = 60 * 60 * 12; // 12h

function getAdminPassword(): string | null {
  const raw = process.env.ADMIN_PASSWORD;
  if (!raw || raw.trim() === '') return null;
  return raw;
}

function expectedToken(password: string): string {
  return createHmac('sha256', password).update('admin').digest('hex');
}

export function authConfigured(): boolean {
  return getAdminPassword() !== null;
}

export function buildAdminCookie(password: string) {
  const token = expectedToken(password);
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  };
}

export function clearAdminCookie() {
  return {
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  };
}

function getCookieToken(request: Request): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === COOKIE_NAME) return rest.join('=');
  }
  return null;
}

export function isAdminRequest(request: Request): boolean {
  const password = getAdminPassword();
  if (!password) return false;
  const token = getCookieToken(request);
  if (!token) return false;
  const expected = expectedToken(password);
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function verifyPassword(input: string): boolean {
  const password = getAdminPassword();
  if (!password) return false;
  if (input.length !== password.length) return false;
  try {
    return timingSafeEqual(Buffer.from(input, 'utf8'), Buffer.from(password, 'utf8'));
  } catch {
    return false;
  }
}

export function requireAdmin(request: Request): NextResponse | null {
  if (!authConfigured()) {
    return NextResponse.json(
      { error: 'Сервер не настроен: задайте переменную ADMIN_PASSWORD' },
      { status: 503 },
    );
  }
  if (!isAdminRequest(request)) {
    return NextResponse.json(
      { error: 'Требуется вход в режим администратора' },
      { status: 401 },
    );
  }
  return null;
}

import { NextResponse } from 'next/server';
import { authConfigured, buildAdminCookie, verifyPassword } from '@/lib/auth';

export async function POST(request: Request) {
  if (!authConfigured()) {
    return NextResponse.json(
      { error: 'Сервер не настроен: задайте переменную ADMIN_PASSWORD' },
      { status: 503 },
    );
  }

  let payload: { password?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Неверный формат запроса' }, { status: 400 });
  }

  const password = payload?.password;
  if (typeof password !== 'string' || password.length === 0) {
    return NextResponse.json({ error: 'Поле password обязательно' }, { status: 400 });
  }

  if (!verifyPassword(password)) {
    return NextResponse.json({ error: 'Неверный пароль' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(buildAdminCookie(password));
  return response;
}

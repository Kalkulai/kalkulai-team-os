import { NextRequest, NextResponse } from 'next/server';
import {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_MAX_AGE_SECONDS,
  checkPassword,
  signAuthCookie,
} from '@/lib/auth-cookie';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!checkPassword(password)) {
    // 401 mit kleiner Verzögerung um Brute-Force unattraktiv zu machen
    await new Promise((r) => setTimeout(r, 250));
    return NextResponse.json({ error: 'Falsches Passwort' }, { status: 401 });
  }

  const cookieValue = await signAuthCookie();
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: cookieValue,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
  });
  return res;
}

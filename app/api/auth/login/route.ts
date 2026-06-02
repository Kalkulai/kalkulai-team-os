import { NextRequest, NextResponse } from 'next/server';
import {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_MAX_AGE_SECONDS,
  checkPassword,
  signAuthCookie,
} from '@/lib/auth-cookie';
import { checkRateLimit, getClientIp, positiveEnvInt } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';

async function memberExists(memberId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('team_members')
    .select('id')
    .eq('id', memberId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

export async function POST(req: NextRequest) {
  const rate = checkRateLimit(`login:${getClientIp(req)}`, {
    limit: positiveEnvInt('TEAM_OS_LOGIN_RATE_LIMIT_PER_MINUTE', 10),
    windowMs: 60_000,
  });
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Zu viele Login-Versuche' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
    );
  }

  const body = await req.json().catch(() => null);
  const password = typeof body?.password === 'string' ? body.password : '';
  const memberId = typeof body?.memberId === 'string' ? body.memberId : '';

  if (!checkPassword(password)) {
    // 401 mit kleiner Verzögerung um Brute-Force unattraktiv zu machen
    await new Promise((r) => setTimeout(r, 250));
    return NextResponse.json({ error: 'Falsches Passwort' }, { status: 401 });
  }

  if (!memberId || !(await memberExists(memberId))) {
    return NextResponse.json({ error: 'Teammitglied auswählen' }, { status: 400 });
  }

  const cookieValue = await signAuthCookie(undefined, undefined, memberId);
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

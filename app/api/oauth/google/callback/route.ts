import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const oauthError = req.nextUrl.searchParams.get('error');

  if (oauthError) {
    return NextResponse.redirect(
      new URL(
        `/settings?calendar=error&reason=${encodeURIComponent(oauthError)}`,
        req.nextUrl.origin
      )
    );
  }
  if (!code || !state) {
    return NextResponse.json({ error: 'code and state required' }, { status: 400 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Google OAuth env not configured' }, { status: 500 });
  }

  const redirectUri = new URL('/api/oauth/google/callback', req.nextUrl.origin).toString();

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(
      new URL(
        `/settings?calendar=error&reason=${encodeURIComponent('token-exchange-' + tokenRes.status)}`,
        req.nextUrl.origin
      )
    );
  }

  const tokens = (await tokenRes.json()) as {
    refresh_token?: string;
    access_token?: string;
    id_token?: string;
  };

  if (!tokens.refresh_token) {
    return NextResponse.redirect(
      new URL('/settings?calendar=error&reason=no-refresh-token', req.nextUrl.origin)
    );
  }

  let email: string | null = null;
  if (tokens.access_token) {
    const userInfo = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (userInfo.ok) {
      const data = (await userInfo.json()) as { email?: string };
      email = data.email ?? null;
    }
  }

  const { error: dbError } = await supabaseAdmin
    .from('team_members')
    .update({
      google_refresh_token: tokens.refresh_token,
      google_calendar_email: email,
    })
    .eq('id', state);

  if (dbError) {
    return NextResponse.redirect(
      new URL('/settings?calendar=error&reason=db', req.nextUrl.origin)
    );
  }

  return NextResponse.redirect(new URL('/settings?calendar=connected', req.nextUrl.origin));
}

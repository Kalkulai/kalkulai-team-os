import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyGoogleOAuthState } from '@/lib/oauth-state';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const oauthError = req.nextUrl.searchParams.get('error');

  console.log('[oauth-cb] entered', { hasCode: !!code, hasState: !!state, oauthError });

  if (oauthError) {
    console.log('[oauth-cb] google-error', oauthError);
    return NextResponse.redirect(
      new URL(
        `/settings?calendar=error&reason=${encodeURIComponent(oauthError)}`,
        req.nextUrl.origin
      )
    );
  }
  if (!code || !state) {
    console.log('[oauth-cb] missing-params', { hasCode: !!code, hasState: !!state });
    return NextResponse.json({ error: 'code and state required' }, { status: 400 });
  }

  const userId = await verifyGoogleOAuthState(state);
  if (!userId) {
    console.log('[oauth-cb] invalid-state');
    return NextResponse.json({ error: 'invalid state' }, { status: 400 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.log('[oauth-cb] env-missing', { hasId: !!clientId, hasSecret: !!clientSecret });
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

  console.log('[oauth-cb] token-exchange', { status: tokenRes.status });

  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => '');
    console.log('[oauth-cb] token-exchange-fail', { status: tokenRes.status, body: body.slice(0, 300) });
    return NextResponse.redirect(
      new URL(
        `/settings?calendar=error&reason=token-exchange-${tokenRes.status}`,
        req.nextUrl.origin
      )
    );
  }

  const tokens = (await tokenRes.json()) as {
    refresh_token?: string;
    access_token?: string;
    id_token?: string;
  };

  console.log('[oauth-cb] tokens', { hasRefresh: !!tokens.refresh_token, hasAccess: !!tokens.access_token });

  if (!tokens.refresh_token) {
    console.log('[oauth-cb] no-refresh-token-redirect', { userId });
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

  console.log('[oauth-cb] db-update', { userId, hasEmail: !!email });

  const { error: dbError } = await supabaseAdmin
    .from('team_members')
    .update({
      google_refresh_token: tokens.refresh_token,
      google_calendar_email: email,
    })
    .eq('id', userId);

  if (dbError) {
    console.log('[oauth-cb] db-error', { msg: dbError.message, code: dbError.code, details: dbError.details });
    return NextResponse.redirect(
      new URL('/settings?calendar=error&reason=db', req.nextUrl.origin)
    );
  }

  console.log('[oauth-cb] success', { userId, email });
  return NextResponse.redirect(
    new URL(`/settings?calendar=connected&member=${userId}`, req.nextUrl.origin)
  );
}

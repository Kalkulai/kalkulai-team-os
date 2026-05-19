import { NextResponse } from 'next/server';
import { getAllMembers } from '@/lib/supabase';

/**
 * Public endpoint (no Bearer) — used by client components for the MemberPill
 * dropdown and the Settings connection-status pills.
 *
 * Security: strips secrets that grant account access (`google_refresh_token`,
 * `github_token`). UI gets boolean `calendar_connected` / `github_connected`
 * derived from their presence.
 */
export async function GET() {
  const members = await getAllMembers();
  const safe = members.map(({ google_refresh_token, github_token, ...rest }) => ({
    ...rest,
    calendar_connected: !!google_refresh_token,
    github_connected: !!github_token,
  }));
  return NextResponse.json(safe);
}

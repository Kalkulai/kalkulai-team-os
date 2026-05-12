import { NextResponse } from 'next/server';
import { getAllMembers } from '@/lib/supabase';

/**
 * Public endpoint (no Bearer) — used by client components for the MemberPill
 * dropdown and the Settings connection-status pills.
 *
 * Security: strips `google_refresh_token` from every row. The other "ID"
 * fields stay because the UI renders boolean-only checks ("verbunden ja/nein")
 * and the Settings connection panel needs them. The refresh-token is the only
 * field that grants real account access if leaked.
 */
export async function GET() {
  const members = await getAllMembers();
  const safe = members.map(({ google_refresh_token: _drop, ...rest }) => rest);
  return NextResponse.json(safe);
}

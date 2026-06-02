import { NextRequest, NextResponse } from 'next/server';
import { requireActor } from '@/lib/auth-context';
import { getAllMembers } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const actor = await requireActor(req);
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const members = await getAllMembers();
  const safe = members.map((member) => ({
    id: member.id,
    name: member.name,
    email: member.email,
    telegram_chat_id: member.telegram_chat_id,
    linear_user_id: member.linear_user_id,
    github_username: member.github_username,
    github_token_expires_at: member.github_token_expires_at,
    hubspot_owner_id: member.hubspot_owner_id,
    google_calendar_id: member.google_calendar_id,
    google_calendar_email: member.google_calendar_email,
    notion_user_id: member.notion_user_id,
    role: member.role,
    calendar_connected: !!member.google_refresh_token,
    github_connected: !!member.github_token,
  }));

  return NextResponse.json(safe);
}

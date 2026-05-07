import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { buildDailyBriefing } from '@/lib/aggregator';
import { formatBriefingMarkdown } from '@/lib/briefing-format';
import type { TeamMember } from '@/types';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!requireApiAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const { data: member, error } = await supabaseAdmin
    .from('team_members')
    .select('*')
    .eq('id', userId)
    .single<TeamMember>();

  if (error || !member) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  const briefing = await buildDailyBriefing(member);
  const markdown = formatBriefingMarkdown(briefing);

  return NextResponse.json({
    member: {
      id: member.id,
      name: member.name,
      telegram_chat_id: member.telegram_chat_id,
      role: member.role,
    },
    markdown,
  });
}

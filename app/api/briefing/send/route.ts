import { NextRequest, NextResponse } from 'next/server';
import { getAllMembers } from '@/lib/supabase';
import { buildDailyBriefing } from '@/lib/aggregator';
import { sendTelegramMessage } from '@/lib/telegram';
import { formatBriefingMarkdown } from '@/lib/briefing-format';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const members = await getAllMembers();
  const recipients = members.filter((m) => m.telegram_chat_id);

  const results = await Promise.allSettled(
    recipients.map(async (m) => {
      const briefing = await buildDailyBriefing(m);
      const text = formatBriefingMarkdown(briefing);
      const send = await sendTelegramMessage(m.telegram_chat_id!, text);
      return { member: m.name, send };
    })
  );

  const summary = results.map((r, i) => ({
    member: recipients[i].name,
    status: r.status,
    detail: r.status === 'fulfilled' ? r.value.send : String(r.reason),
  }));

  return NextResponse.json({ ok: true, sent: recipients.length, summary });
}

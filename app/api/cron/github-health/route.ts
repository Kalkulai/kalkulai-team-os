import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getGithubHealth } from '@/lib/github';
import { sendTelegramMessage } from '@/lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface MemberRow {
  id: string;
  name: string;
  telegram_chat_id: string | null;
  github_username: string | null;
  github_token: string | null;
  github_token_expires_at: string | null;
}

interface MemberReport {
  name: string;
  status:
    | 'ok'
    | 'unauthorized'
    | 'rate-limited'
    | 'unreachable'
    | 'no-token'
    | 'expiring-soon'
    | 'expired';
  daysUntilExpiry?: number;
  notified: boolean;
}

const WARN_DAYS = 14;

function diffDays(target: string, now: Date): number {
  const t = new Date(target + 'T00:00:00Z').getTime();
  return Math.floor((t - now.getTime()) / 86400000);
}

/**
 * Daily token-health cron. Pings every member's PAT against /rate_limit and
 * sends a Telegram heads-up when:
 *  - the token is 401/dead
 *  - the user-set expiry date is in the past
 *  - the expiry date is within 14 days
 */
export async function GET(req: NextRequest) {
  if (!requireApiAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: rows, error } = await supabaseAdmin
    .from('team_members')
    .select('id, name, telegram_chat_id, github_username, github_token, github_token_expires_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = new Date();
  const reports: MemberReport[] = [];

  for (const m of (rows ?? []) as MemberRow[]) {
    if (!m.github_username) continue;

    if (!m.github_token) {
      reports.push({ name: m.name, status: 'no-token', notified: false });
      continue;
    }

    const health = await getGithubHealth(m.github_token);
    let status: MemberReport['status'] = health;
    let daysLeft: number | undefined;

    if (m.github_token_expires_at) {
      daysLeft = diffDays(m.github_token_expires_at, now);
      if (daysLeft < 0) status = 'expired';
      else if (daysLeft <= WARN_DAYS && status === 'ok') status = 'expiring-soon';
    }

    let notified = false;
    if (
      m.telegram_chat_id &&
      (status === 'unauthorized' || status === 'expired' || status === 'expiring-soon')
    ) {
      const msg =
        status === 'unauthorized'
          ? '⚠️ *GitHub-Sync defekt*\n\nDein PAT antwortet mit 401. Bitte neuen Token erzeugen und in Supabase `team_members.github_token` eintragen.'
          : status === 'expired'
            ? `⚠️ *GitHub-Token abgelaufen* (${m.github_token_expires_at})\n\nDashboard sieht deine Aktivitäten nicht mehr. Neuen PAT erzeugen + in Supabase eintragen.`
            : `ℹ️ *GitHub-Token läuft in ${daysLeft} Tag(en) ab* (${m.github_token_expires_at})\n\nZeit einen neuen PAT zu erzeugen — am besten gleich, dann ist es weg vom Tisch.`;
      const sent = await sendTelegramMessage(m.telegram_chat_id, msg);
      notified = sent.ok;
    }

    reports.push({ name: m.name, status, daysUntilExpiry: daysLeft, notified });
  }

  return NextResponse.json({ ranAt: now.toISOString(), reports });
}

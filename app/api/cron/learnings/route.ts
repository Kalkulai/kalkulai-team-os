import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { currentWeekIsoStart } from '@/lib/business-metrics';
import { writeVaultFile } from '@/lib/vault-sync';
import { sendToHermes } from '@/lib/hermes-chat';

export const runtime = 'nodejs';
export const maxDuration = 240;

/**
 * Weekly Action-Learning cron — invoked Sun 20:00 by the timer on agents-01.
 * Pulls this week's metric_week rows, asks Hermes to extract patterns
 * and forcing-questions, writes the result as a markdown "decision" into
 * the vault under 02_Areas/decisions/.
 */
export async function POST(req: NextRequest) {
  if (!requireApiAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const weekStart = currentWeekIsoStart();

  const [{ data: members, error: errM }, { data: rows, error: errR }] = await Promise.all([
    supabaseAdmin.from('team_members').select('id, name, role').order('name'),
    supabaseAdmin.from('metric_week').select('*').eq('week_start', weekStart),
  ]);
  if (errM) return NextResponse.json({ error: errM.message }, { status: 500 });
  if (errR) return NextResponse.json({ error: errR.message }, { status: 500 });

  const byMember = new Map<string, Array<{ key: string; sum: number }>>();
  for (const r of (rows ?? []) as Array<{ member_id: string; metric_key: string; sum_value: number }>) {
    const arr = byMember.get(r.member_id) ?? [];
    arr.push({ key: r.metric_key, sum: Number(r.sum_value) });
    byMember.set(r.member_id, arr);
  }

  const summaryLines: string[] = [`# Wochenwerte ${weekStart}`];
  for (const m of (members ?? []) as Array<{ id: string; name: string; role: string }>) {
    summaryLines.push(`\n## ${m.name} (${m.role})`);
    const metrics = byMember.get(m.id) ?? [];
    if (metrics.length === 0) {
      summaryLines.push(`_keine Daten_`);
    } else {
      for (const x of metrics) {
        summaryLines.push(`- ${x.key}: ${x.sum}`);
      }
    }
  }
  const summary = summaryLines.join('\n');

  const prompt = [
    'Hier sind die KalkulAI-Team-Metriken dieser Woche:',
    '',
    summary,
    '',
    'Aufgabe (Action-Learning):',
    '1) Identifiziere maximal 3 Muster/Trends die auffallen (positiv oder negativ).',
    '2) Stelle pro Pattern eine harte Forcing-Question im Stil von Sam Altman / YC.',
    '3) Schlage konkrete Action-Items für nächste Woche vor (max 5, sortiert nach Impact).',
    '4) Antwort in Markdown, deutsch, kompakt — keine Floskeln.',
  ].join('\n');

  let reply = '';
  try {
    reply = await sendToHermes({
      message: prompt,
      userLabel: 'Team-OS Auto-Cron',
    });
  } catch (err) {
    return NextResponse.json({ error: `hermes failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
  }

  if (!reply.trim()) {
    return NextResponse.json({ error: 'empty hermes reply' }, { status: 502 });
  }

  const fileBody = [
    '---',
    'type: action-learning',
    'scope: weekly',
    `week_start: ${weekStart}`,
    `generated_at: ${new Date().toISOString()}`,
    'generated_by: team-os cron + hermes',
    '---',
    '',
    `# Action-Learning Woche ${weekStart}`,
    '',
    '## Eingangsdaten',
    '',
    '```',
    summary,
    '```',
    '',
    '## Hermes-Analyse',
    '',
    reply,
    '',
  ].join('\n');

  const fname = `${weekStart}-action-learning.md`;
  const relPath = `02_Areas/decisions/${fname}`;
  await writeVaultFile(relPath, fileBody);
  return NextResponse.json({ ok: true, weekStart, path: relPath, bytes: fileBody.length });
}

export async function GET(req: NextRequest) {
  return POST(req);
}

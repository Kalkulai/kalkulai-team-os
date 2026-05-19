import { format, startOfWeek } from 'date-fns';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Writes a markdown file to the Hermes vault via the bridge.
 * Path is relative to `/opt/obsidian/vault/`; only `02_Areas/health/*`
 * and `02_Areas/decisions/*` are allowed by the bridge.
 */
export async function writeVaultFile(relPath: string, content: string): Promise<void> {
  const base = process.env.HERMES_BRIDGE_URL;
  const token = process.env.HERMES_BRIDGE_TOKEN;
  if (!base || !token) {
    throw new Error('HERMES_BRIDGE_URL / HERMES_BRIDGE_TOKEN not configured');
  }
  const res = await fetch(`${base.replace(/\/$/, '')}/api/vault/write`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path: relPath, content }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Vault-write ${res.status}: ${txt.slice(0, 300)}`);
  }
}

interface MemberRow {
  id: string;
  name: string;
  role: string;
}

function isoWeek(d: Date): string {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
  }
  const weekNo = 1 + Math.ceil((firstThursday - target.valueOf()) / (7 * 86400000));
  return `${new Date(firstThursday).getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Aggregate the current week's metrics and write a structured markdown
 * report into the vault so Hermes can read it via the obsidian skill.
 */
export async function syncWeeklyHealthReport(): Promise<{ path: string; bytes: number }> {
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const week = isoWeek(new Date());

  const [{ data: members, error: errM }, { data: rows, error: errR }] = await Promise.all([
    supabaseAdmin.from('team_members').select('id, name, role').order('name'),
    supabaseAdmin.from('metric_week').select('*').eq('week_start', weekStart),
  ]);
  if (errM) throw errM;
  if (errR) throw errR;

  const byMember = new Map<string, Array<{ key: string; sum: number; count: number }>>();
  for (const r of (rows ?? []) as Array<{ member_id: string; metric_key: string; sum_value: number; sample_count: number }>) {
    const arr = byMember.get(r.member_id) ?? [];
    arr.push({ key: r.metric_key, sum: Number(r.sum_value), count: r.sample_count });
    byMember.set(r.member_id, arr);
  }

  const lines: string[] = [];
  lines.push(`---`);
  lines.push(`type: health-report`);
  lines.push(`scope: weekly`);
  lines.push(`week: ${week}`);
  lines.push(`week_start: ${weekStart}`);
  lines.push(`generated_at: ${new Date().toISOString()}`);
  lines.push(`generated_by: team-os snapshot-cron`);
  lines.push(`---`);
  lines.push(``);
  lines.push(`# Wochen-Health-Report ${week}`);
  lines.push(``);
  lines.push(`*Auto-generiert vom Team-OS Dashboard. Quelle: \`business_metrics\` Tabelle.*`);
  lines.push(``);

  for (const m of (members ?? []) as MemberRow[]) {
    lines.push(`## ${m.name} (${m.role})`);
    const metrics = byMember.get(m.id) ?? [];
    if (metrics.length === 0) {
      lines.push(`_Keine Metriken diese Woche._`);
    } else {
      lines.push(`| Metric | Wochensumme | Tage mit Daten |`);
      lines.push(`|---|---:|---:|`);
      for (const x of metrics) {
        lines.push(`| ${x.key} | ${x.sum} | ${x.count} |`);
      }
    }
    lines.push(``);
  }

  const content = lines.join('\n');
  const relPath = `02_Areas/health/weekly/${week}.md`;
  await writeVaultFile(relPath, content);
  return { path: relPath, bytes: content.length };
}

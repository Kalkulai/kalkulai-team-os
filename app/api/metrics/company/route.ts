import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { METRIC_KEYS, currentWeekIsoStart } from '@/lib/business-metrics';
import { format } from 'date-fns';
import { getPilotActivity } from '@/lib/pilot-activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface MemberLite {
  id: string;
  name: string;
  role: string;
}

interface DailyRow {
  member_id: string;
  day: string;
  metric_key: string;
  value: number;
}

const VELOCITY_KEYS = [METRIC_KEYS.TASKS_COMPLETED, METRIC_KEYS.COMMITS_COUNT] as const;
const HERO_KEYS = [
  METRIC_KEYS.PILOTS_ACTIVE,
  METRIC_KEYS.PIPELINE_VALUE_EUR,
  METRIC_KEYS.DEMO_TO_PILOT_PCT,
  METRIC_KEYS.DEMOS_COMPLETED,
] as const;

function isoDay(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

// Mo=0 .. So=6 (ISO weekday convention)
function isoWeekday(day: string): number {
  const d = new Date(day + 'T00:00:00Z');
  const js = d.getUTCDay(); // 0=Sun..6=Sat
  return (js + 6) % 7;
}

export async function GET(req: NextRequest) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const today = new Date();
  const { data: membersRaw, error: memErr } = await supabaseAdmin
    .from('team_members')
    .select('id, name, role')
    .order('name', { ascending: true });
  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 });
  const members = (membersRaw ?? []) as MemberLite[];
  const pilotActivity = await getPilotActivity();

  const since30 = isoDay(new Date(today.getTime() - 29 * 86400000));
  const weekStart = currentWeekIsoStart();

  const { data: velRowsRaw, error: velErr } = await supabaseAdmin
    .from('business_metrics')
    .select('member_id, day, metric_key, value')
    .gte('day', since30)
    .in('metric_key', VELOCITY_KEYS as unknown as string[]);
  if (velErr) return NextResponse.json({ error: velErr.message }, { status: 500 });
  const velRows = (velRowsRaw ?? []) as DailyRow[];

  const { data: heroRowsRaw, error: heroErr } = await supabaseAdmin
    .from('metric_week')
    .select('member_id, metric_key, sum_value, max_value, avg_value')
    .eq('week_start', weekStart)
    .in('metric_key', HERO_KEYS as unknown as string[]);
  if (heroErr) return NextResponse.json({ error: heroErr.message }, { status: 500 });

  const heroByKey = new Map<string, { sum: number; max: number; values: number[] }>();
  for (const k of HERO_KEYS) heroByKey.set(k, { sum: 0, max: 0, values: [] });
  for (const r of heroRowsRaw ?? []) {
    const row = r as { metric_key: string; sum_value: number; max_value: number; avg_value: number };
    const slot = heroByKey.get(row.metric_key);
    if (!slot) continue;
    slot.sum += Number(row.sum_value ?? 0);
    slot.max = Math.max(slot.max, Number(row.max_value ?? 0));
    slot.values.push(Number(row.avg_value ?? 0));
  }
  const avg = (xs: number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
  const hero = {
    pilots_active: heroByKey.get(METRIC_KEYS.PILOTS_ACTIVE)?.max ?? 0,
    pipeline_value_eur: heroByKey.get(METRIC_KEYS.PIPELINE_VALUE_EUR)?.sum ?? 0,
    demo_to_pilot_pct: avg(heroByKey.get(METRIC_KEYS.DEMO_TO_PILOT_PCT)?.values ?? []),
    demos_completed_week: heroByKey.get(METRIC_KEYS.DEMOS_COMPLETED)?.sum ?? 0,
  };

  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    days.push(isoDay(new Date(today.getTime() - i * 86400000)));
  }
  const dayIndex = new Map(days.map((d, i) => [d, i]));

  const seriesByMember = new Map<string, number[]>();
  for (const m of members) seriesByMember.set(m.id, new Array(30).fill(0));
  for (const r of velRows) {
    const idx = dayIndex.get(r.day);
    if (idx === undefined) continue;
    const arr = seriesByMember.get(r.member_id);
    if (!arr) continue;
    arr[idx] += Number(r.value ?? 0);
  }

  const series = members.map((m) => ({
    memberId: m.id,
    name: m.name,
    role: m.role,
    daily: seriesByMember.get(m.id) ?? new Array(30).fill(0),
  }));

  const heatmap = members.map((m) => {
    const sums = new Array(7).fill(0);
    const counts = new Array(7).fill(0);
    for (const r of velRows) {
      if (r.member_id !== m.id) continue;
      const wd = isoWeekday(r.day);
      sums[wd] += Number(r.value ?? 0);
      counts[wd] += 1;
    }
    const byWeekday = sums.map((s, i) => (counts[i] > 0 ? s / counts[i] : 0));
    return { memberId: m.id, name: m.name, byWeekday };
  });

  return NextResponse.json({
    week_start: weekStart,
    days,
    hero,
    series,
    heatmap,
    pilot_activity: pilotActivity,
  });
}

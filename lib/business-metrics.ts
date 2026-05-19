import { supabaseAdmin } from '@/lib/supabase';
import { format, startOfWeek, startOfMonth } from 'date-fns';

export interface MetricRow {
  id: string;
  member_id: string;
  metric_key: string;
  day: string;
  value: number;
  meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface WeekAggregate {
  metric_key: string;
  week_start: string;
  sum_value: number;
  avg_value: number;
  max_value: number;
  min_value: number;
  sample_count: number;
}

export interface MonthAggregate {
  metric_key: string;
  month_start: string;
  sum_value: number;
  avg_value: number;
  max_value: number;
  min_value: number;
  sample_count: number;
}

export function todayDay(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function currentWeekIsoStart(): string {
  return format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
}

export function currentMonthStart(): string {
  return format(startOfMonth(new Date()), 'yyyy-MM-dd');
}

/**
 * Idempotent upsert. If the same (member_id, metric_key, day) exists, value+meta are replaced.
 * Use this from snapshot crons so re-runs same day don't duplicate.
 */
export async function recordMetric(args: {
  memberId: string;
  metricKey: string;
  day?: string;
  value: number;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  const day = args.day ?? todayDay();
  const { error } = await supabaseAdmin
    .from('business_metrics')
    .upsert(
      {
        member_id: args.memberId,
        metric_key: args.metricKey,
        day,
        value: args.value,
        meta: args.meta ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'member_id,metric_key,day' },
    );
  if (error) throw error;
}

export async function getMetricSeries(
  memberId: string,
  metricKey: string,
  sinceDay: string,
): Promise<MetricRow[]> {
  const { data, error } = await supabaseAdmin
    .from('business_metrics')
    .select('*')
    .eq('member_id', memberId)
    .eq('metric_key', metricKey)
    .gte('day', sinceDay)
    .order('day', { ascending: true });
  if (error) throw error;
  return (data ?? []) as MetricRow[];
}

export async function getWeekAggregates(
  memberId: string,
  metricKeys: string[],
  weekStart: string,
): Promise<Record<string, WeekAggregate | null>> {
  const { data, error } = await supabaseAdmin
    .from('metric_week')
    .select('metric_key, week_start, sum_value, avg_value, max_value, min_value, sample_count')
    .eq('member_id', memberId)
    .in('metric_key', metricKeys)
    .eq('week_start', weekStart);
  if (error) throw error;
  const out: Record<string, WeekAggregate | null> = {};
  for (const k of metricKeys) out[k] = null;
  for (const row of data ?? []) {
    const r = row as unknown as WeekAggregate;
    out[r.metric_key] = r;
  }
  return out;
}

export async function getMonthAggregates(
  memberId: string,
  metricKeys: string[],
  monthStart: string,
): Promise<Record<string, MonthAggregate | null>> {
  const { data, error } = await supabaseAdmin
    .from('metric_month')
    .select('metric_key, month_start, sum_value, avg_value, max_value, min_value, sample_count')
    .eq('member_id', memberId)
    .in('metric_key', metricKeys)
    .eq('month_start', monthStart);
  if (error) throw error;
  const out: Record<string, MonthAggregate | null> = {};
  for (const k of metricKeys) out[k] = null;
  for (const row of data ?? []) {
    const r = row as unknown as MonthAggregate;
    out[r.metric_key] = r;
  }
  return out;
}

/** Sparkline-style: returns last N days values, gaps filled with 0. */
export async function getDailySparkline(
  memberId: string,
  metricKey: string,
  days = 14,
): Promise<Array<{ day: string; value: number }>> {
  const since = format(new Date(Date.now() - days * 86400000), 'yyyy-MM-dd');
  const rows = await getMetricSeries(memberId, metricKey, since);
  const byDay = new Map(rows.map((r) => [r.day, Number(r.value)]));
  const out: Array<{ day: string; value: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = format(new Date(Date.now() - i * 86400000), 'yyyy-MM-dd');
    out.push({ day: d, value: byDay.get(d) ?? 0 });
  }
  return out;
}

export const METRIC_KEYS = {
  // DORA / Dev velocity (personal)
  DEPLOYS_PER_DAY: 'deploys_per_day',
  LEAD_TIME_MIN_P50: 'lead_time_min_p50',
  COMMITS_COUNT: 'commits_count',
  TASKS_COMPLETED: 'tasks_completed',
  // Health (personal)
  BUG_FIX_HOURS_P50: 'bug_fix_hours_p50',
  BUGS_OPENED: 'bugs_opened',
  BUGS_CLOSED: 'bugs_closed',
  // Sales (company)
  PIPELINE_VALUE_EUR: 'pipeline_value_eur',
  DEMOS_COMPLETED: 'demos_completed',
  DEMO_TO_PILOT_PCT: 'demo_to_pilot_pct',
  // Pilot (company)
  PILOTS_ACTIVE: 'pilots_active',
  // Founder (personal)
  CUSTOMER_CONVERSATIONS: 'customer_conversations',
  COMMITMENT_HIT_PCT: 'commitment_hit_pct',
  DEEP_WORK_BLOCKS: 'deep_work_blocks',
} as const;

export type MetricKey = typeof METRIC_KEYS[keyof typeof METRIC_KEYS];

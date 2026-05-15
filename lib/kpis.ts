import { supabaseAdmin } from './supabase';
import { getCallsThisWeek } from './hubspot';
import type { Kpi, KpiWithWeek, KpiType, KpiSource, TeamMember } from '@/types';

interface KpiRow {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  unit: string;
  position: number;
  type: KpiType;
  due_date: string | null;
  completed: boolean;
  created_at: string;
  source: KpiSource;
}

/**
 * Live-resolve the `actual` value for a non-manual counter-KPI from its
 * external source. Fail-soft: returns 0 if member lacks the relevant ID or
 * the API is unreachable (mirror of aggregator.ts:32-34 Promise.allSettled
 * pattern).
 *
 * `kpiCreatedAt` (ISO timestamp) is used as a lower bound for HubSpot Calls
 * so newly-created KPIs don't retroactively count pre-creation activity.
 * The source itself decides whether/how to apply it — current rule for
 * `hubspot:calls-week`: take max(monday-this-week, kpiCreatedAt).
 */
export async function resolveActualFromSource(
  source: KpiSource,
  member: TeamMember | null,
  kpiCreatedAt?: string,
): Promise<number> {
  if (source === 'manual') return 0;
  if (source === 'hubspot:calls-week') {
    if (!member?.hubspot_owner_id) return 0;
    try {
      const since = kpiCreatedAt ? new Date(kpiCreatedAt) : undefined;
      const calls = await getCallsThisWeek(member.hubspot_owner_id, since);
      return calls.length;
    } catch {
      return 0;
    }
  }
  return 0;
}

interface WeekRow {
  kpi_id: string;
  target: number;
  actual: number;
}

const HISTORY_DAYS = 7;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Daily snapshots for counter-KPIs. Returns a dense array (length === days,
 * oldest → newest) per kpi_id with forward-fill for missing days.
 */
export async function getKpiHistory(
  kpiIds: string[],
  days: number = HISTORY_DAYS,
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (!kpiIds.length) return out;
  const since = daysAgoISO(days - 1);
  const { data, error } = await supabaseAdmin
    .from('kpi_history')
    .select('kpi_id, day, actual')
    .in('kpi_id', kpiIds)
    .gte('day', since)
    .order('day', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as Array<{ kpi_id: string; day: string; actual: number }>;

  const byKpi = new Map<string, Map<string, number>>();
  for (const r of rows) {
    let m = byKpi.get(r.kpi_id);
    if (!m) {
      m = new Map<string, number>();
      byKpi.set(r.kpi_id, m);
    }
    m.set(r.day, r.actual);
  }

  for (const kpiId of kpiIds) {
    const dayMap = byKpi.get(kpiId) ?? new Map<string, number>();
    const series: number[] = [];
    let last = 0;
    for (let i = days - 1; i >= 0; i--) {
      const day = daysAgoISO(i);
      const v = dayMap.get(day);
      if (v !== undefined) last = v;
      series.push(last);
    }
    out.set(kpiId, series);
  }
  return out;
}

export async function listUserKpis(userId: string, weekStart: string): Promise<KpiWithWeek[]> {
  const { data: defs, error: defErr } = await supabaseAdmin
    .from('kpis')
    .select('*')
    .eq('user_id', userId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (defErr) throw defErr;
  const definitions = (defs ?? []) as KpiRow[];
  if (!definitions.length) return [];

  const counterIds = definitions.filter((d) => d.type === 'counter').map((d) => d.id);
  const weekByKpi = new Map<string, WeekRow>();
  let historyByKpi = new Map<string, number[]>();

  if (counterIds.length > 0) {
    const { data: weeks, error: weekErr } = await supabaseAdmin
      .from('kpi_weeks')
      .select('kpi_id, target, actual')
      .eq('week_start', weekStart)
      .in('kpi_id', counterIds);
    if (weekErr) throw weekErr;
    for (const w of (weeks ?? []) as WeekRow[]) weekByKpi.set(w.kpi_id, w);

    try {
      historyByKpi = await getKpiHistory(counterIds);
    } catch {
      // kpi_history-Tabelle ggf. noch nicht migriert → silent skip
    }
  }

  // Resolve actuals for non-manual counters live from their external source.
  // Only fetch member if at least one auto-source KPI exists (saves a DB hop).
  const autoDefById = new Map<string, KpiRow>();
  for (const d of definitions) {
    if (d.type === 'counter' && d.source !== 'manual') autoDefById.set(d.id, d);
  }
  let member: TeamMember | null = null;
  if (autoDefById.size > 0) {
    const { data: m } = await supabaseAdmin
      .from('team_members')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    member = (m as TeamMember | null) ?? null;
  }
  const autoActuals = new Map<string, number>();
  for (const [kpiId, def] of autoDefById) {
    autoActuals.set(
      kpiId,
      await resolveActualFromSource(def.source, member, def.created_at),
    );
  }

  return definitions.map((d) => ({
    ...d,
    target: weekByKpi.get(d.id)?.target ?? 0,
    actual: autoActuals.has(d.id)
      ? (autoActuals.get(d.id) as number)
      : weekByKpi.get(d.id)?.actual ?? 0,
    // History only for manual counters — auto-sourced KPIs don't snapshot to kpi_history.
    history: autoActuals.has(d.id) ? undefined : historyByKpi.get(d.id),
  }));
}

export async function createKpi(input: {
  user_id: string;
  parent_id?: string | null;
  name: string;
  unit?: string;
  target?: number;
  week_start: string;
  type?: KpiType;
  due_date?: string | null;
  source?: KpiSource;
}): Promise<KpiWithWeek> {
  const type: KpiType = input.type ?? 'counter';
  // Source only meaningful for counters; force 'manual' on project/step rows.
  const source: KpiSource = type === 'counter' ? (input.source ?? 'manual') : 'manual';

  const { data: maxRow } = await supabaseAdmin
    .from('kpis')
    .select('position')
    .eq('user_id', input.user_id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = (maxRow?.position ?? -1) + 1;

  const { data: kpi, error: kpiErr } = await supabaseAdmin
    .from('kpis')
    .insert({
      user_id: input.user_id,
      parent_id: input.parent_id ?? null,
      name: input.name,
      unit: input.unit ?? '',
      position: nextPosition,
      type,
      due_date: input.due_date ?? null,
      source,
    })
    .select()
    .single();
  if (kpiErr) throw kpiErr;

  const target = input.target ?? 0;
  // Only seed kpi_weeks for manual counters. Auto-sourced counters read live
  // from their external source — no row in kpi_weeks needed (target still
  // matters but is added on first setKpiTarget call from the UI).
  if (type === 'counter' && source === 'manual') {
    const { error: weekErr } = await supabaseAdmin.from('kpi_weeks').insert({
      kpi_id: kpi.id,
      week_start: input.week_start,
      target,
      actual: 0,
    });
    if (weekErr) throw weekErr;
  } else if (type === 'counter' && target > 0) {
    // Auto-counter with explicit target: persist target only (actual is computed).
    const { error: weekErr } = await supabaseAdmin.from('kpi_weeks').insert({
      kpi_id: kpi.id,
      week_start: input.week_start,
      target,
      actual: 0,
    });
    if (weekErr) throw weekErr;
  }

  return { ...(kpi as Kpi), target, actual: 0 };
}

export async function updateKpiDefinition(
  id: string,
  patch: {
    name?: string;
    unit?: string;
    parent_id?: string | null;
    position?: number;
    due_date?: string | null;
    completed?: boolean;
  }
): Promise<void> {
  // Mirror `completed` into `completed_at` so the Activity-Stream can filter
  // by "completed within last 2 days". Setting completed=false also clears it.
  const dbPatch: Record<string, unknown> = { ...patch };
  if (patch.completed === true) dbPatch.completed_at = new Date().toISOString();
  else if (patch.completed === false) dbPatch.completed_at = null;
  const { error } = await supabaseAdmin.from('kpis').update(dbPatch).eq('id', id);
  if (error) throw error;
}

export interface CompletedStep {
  id: string;
  name: string;
  completed_at: string;
  parent_name: string | null;
}

/**
 * Recently completed project steps for a user. Only `type='step'` rows are
 * returned — counter-KPIs increment via kpi_weeks and are never "completed".
 */
export async function getRecentlyCompletedSteps(
  userId: string,
  sinceISO: string,
): Promise<CompletedStep[]> {
  const { data, error } = await supabaseAdmin
    .from('kpis')
    .select('id, name, completed_at, parent_id, type')
    .eq('user_id', userId)
    .eq('type', 'step')
    .eq('completed', true)
    .gte('completed_at', sinceISO)
    .order('completed_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    id: string;
    name: string;
    completed_at: string;
    parent_id: string | null;
  }>;
  if (!rows.length) return [];

  const parentIds = Array.from(new Set(rows.map((r) => r.parent_id).filter(Boolean) as string[]));
  const parentNameById = new Map<string, string>();
  if (parentIds.length > 0) {
    const { data: parents, error: parentErr } = await supabaseAdmin
      .from('kpis')
      .select('id, name')
      .in('id', parentIds);
    if (parentErr) throw parentErr;
    for (const p of (parents ?? []) as Array<{ id: string; name: string }>) {
      parentNameById.set(p.id, p.name);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    completed_at: r.completed_at,
    parent_name: r.parent_id ? parentNameById.get(r.parent_id) ?? null : null,
  }));
}

export interface CounterActivity {
  kpi_id: string;
  kpi_name: string;
  unit: string;
  day: string;
  delta: number;
}

/**
 * Aggregates daily Counter-KPI deltas (per kpi_id, per day) from kpi_history.
 * Each day's delta = actual(day) − actual(previous-stored-day-or-0).
 * Only days within [sinceDay..today] are returned with a positive delta.
 */
export async function getRecentCounterActivity(
  userId: string,
  sinceDay: string,
): Promise<CounterActivity[]> {
  const { data: defs, error: defErr } = await supabaseAdmin
    .from('kpis')
    .select('id, name, unit, type')
    .eq('user_id', userId)
    .eq('type', 'counter');
  if (defErr) throw defErr;
  const counters = (defs ?? []) as Array<{ id: string; name: string; unit: string }>;
  if (counters.length === 0) return [];

  const ids = counters.map((c) => c.id);
  const { data: rows, error } = await supabaseAdmin
    .from('kpi_history')
    .select('kpi_id, day, actual')
    .in('kpi_id', ids)
    .order('day', { ascending: true });
  if (error) throw error;
  const history = (rows ?? []) as Array<{ kpi_id: string; day: string; actual: number }>;

  const nameById = new Map(counters.map((c) => [c.id, c]));
  const byKpi = new Map<string, typeof history>();
  for (const r of history) {
    const arr = byKpi.get(r.kpi_id) ?? [];
    arr.push(r);
    byKpi.set(r.kpi_id, arr);
  }

  const out: CounterActivity[] = [];
  for (const [kpiId, list] of byKpi) {
    const meta = nameById.get(kpiId);
    if (!meta) continue;
    let prev = 0;
    for (const r of list) {
      const delta = r.actual - prev;
      prev = r.actual;
      if (delta <= 0) continue;
      if (r.day < sinceDay) continue;
      out.push({ kpi_id: kpiId, kpi_name: meta.name, unit: meta.unit, day: r.day, delta });
    }
  }
  out.sort((a, b) => b.day.localeCompare(a.day));
  return out;
}

export async function setKpiTarget(kpiId: string, weekStart: string, target: number): Promise<void> {
  const { error } = await supabaseAdmin.from('kpi_weeks').upsert(
    { kpi_id: kpiId, week_start: weekStart, target },
    { onConflict: 'kpi_id,week_start' }
  );
  if (error) throw error;
}

export async function adjustKpiActual(
  kpiId: string,
  weekStart: string,
  delta: number
): Promise<{ target: number; actual: number }> {
  const { data: existing } = await supabaseAdmin
    .from('kpi_weeks')
    .select('target, actual')
    .eq('kpi_id', kpiId)
    .eq('week_start', weekStart)
    .maybeSingle();

  const target = existing?.target ?? 0;
  const next = Math.max(0, (existing?.actual ?? 0) + delta);

  const { error } = await supabaseAdmin.from('kpi_weeks').upsert(
    { kpi_id: kpiId, week_start: weekStart, target, actual: next },
    { onConflict: 'kpi_id,week_start' }
  );
  if (error) throw error;

  // Tages-Snapshot für Sparkline. Idempotent über (kpi_id, day).
  try {
    const { error: histErr } = await supabaseAdmin.from('kpi_history').upsert(
      { kpi_id: kpiId, day: todayISO(), actual: next, updated_at: new Date().toISOString() },
      { onConflict: 'kpi_id,day' }
    );
    if (histErr) throw histErr;
  } catch {
    // kpi_history-Tabelle ggf. noch nicht migriert → silent skip
  }

  return { target, actual: next };
}

export async function deleteKpi(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from('kpis').delete().eq('id', id);
  if (error) throw error;
}

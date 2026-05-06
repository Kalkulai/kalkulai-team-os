import { supabaseAdmin } from './supabase';
import type { Kpi, KpiWithWeek, KpiType } from '@/types';

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
}

interface WeekRow {
  kpi_id: string;
  target: number;
  actual: number;
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

  if (counterIds.length > 0) {
    const { data: weeks, error: weekErr } = await supabaseAdmin
      .from('kpi_weeks')
      .select('kpi_id, target, actual')
      .eq('week_start', weekStart)
      .in('kpi_id', counterIds);
    if (weekErr) throw weekErr;
    for (const w of (weeks ?? []) as WeekRow[]) weekByKpi.set(w.kpi_id, w);
  }

  return definitions.map((d) => ({
    ...d,
    target: weekByKpi.get(d.id)?.target ?? 0,
    actual: weekByKpi.get(d.id)?.actual ?? 0,
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
}): Promise<KpiWithWeek> {
  const type: KpiType = input.type ?? 'counter';

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
    })
    .select()
    .single();
  if (kpiErr) throw kpiErr;

  const target = input.target ?? 0;
  if (type === 'counter') {
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
  const { error } = await supabaseAdmin.from('kpis').update(patch).eq('id', id);
  if (error) throw error;
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
  return { target, actual: next };
}

export async function deleteKpi(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from('kpis').delete().eq('id', id);
  if (error) throw error;
}

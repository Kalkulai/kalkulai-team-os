import { supabaseAdmin } from '@/lib/supabase';
import type { FinanceData } from '@/types/finance';

// Supabase read/write for finance snapshots (table: finance_snapshots, see
// migration 021). Kept separate from lib/finance-data.ts (pure defaults) so the
// defaults stay importable without a DB connection.

export type FinanceScenario = 'exist' | 'current';

export const FINANCE_SCENARIOS: readonly FinanceScenario[] = ['exist', 'current'];

export function isFinanceScenario(value: unknown): value is FinanceScenario {
  return value === 'exist' || value === 'current';
}

/** Latest snapshot for a scenario, or null if none stored yet. */
export async function getLatestFinanceSnapshot(
  scenario: FinanceScenario,
): Promise<FinanceData | null> {
  const { data, error } = await supabaseAdmin
    .from('finance_snapshots')
    .select('data')
    .eq('scenario', scenario)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.data as FinanceData | undefined) ?? null;
}

/** Latest snapshot across all scenarios — the live default for the dashboard. */
export async function getLatestFinanceSnapshotAny(): Promise<FinanceData | null> {
  const { data, error } = await supabaseAdmin
    .from('finance_snapshots')
    .select('data')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.data as FinanceData | undefined) ?? null;
}

/** Append a new snapshot (history is kept; reads take the latest). */
export async function insertFinanceSnapshot(
  scenario: FinanceScenario,
  payload: FinanceData,
  source?: string,
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('finance_snapshots')
    .insert({ scenario, as_of: payload.as_of, data: payload, source: source ?? null })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

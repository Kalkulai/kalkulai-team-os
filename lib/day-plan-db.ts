import { supabaseAdmin } from '@/lib/supabase';
import type { DayBlock, DayPlan } from '@/lib/day-plan';

interface DayPlanRow {
  plan_date: string;
  blocks: DayBlock[] | null;
  generated_by: string | null;
  updated_at: string | null;
}

export async function getDayPlan(userId: string, date: string): Promise<DayPlan | null> {
  const { data, error } = await supabaseAdmin
    .from('day_plan')
    .select('plan_date, blocks, generated_by, updated_at')
    .eq('user_id', userId)
    .eq('plan_date', date)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as DayPlanRow;
  return {
    date: r.plan_date,
    blocks: Array.isArray(r.blocks) ? r.blocks : [],
    generatedBy: r.generated_by,
    updatedAt: r.updated_at,
  };
}

export async function upsertDayPlan(
  userId: string,
  date: string,
  blocks: DayBlock[],
  generatedBy: string,
): Promise<void> {
  const { error } = await supabaseAdmin.from('day_plan').upsert(
    {
      user_id: userId,
      plan_date: date,
      blocks,
      generated_by: generatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,plan_date' },
  );
  if (error) throw error;
}

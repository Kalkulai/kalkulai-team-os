import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { syncKpiPayload, type KpiSyncPayload } from '@/lib/kpis';
import { revalidateDashboard } from '@/lib/revalidate';

/**
 * External KPI sync (Hermes / ops scripts). Bearer auth.
 * Upserts counter-KPIs by (user_id, name, source) and writes the week's
 * target/actual. Only external:* sources are accepted — manual + hubspot KPIs
 * stay managed via /api/kpis. Mirrors app/api/campaigns/sync auth + upsert style.
 *
 * Body: { mode?, projects?: [...], kpis?: [{ user_id, name, unit, target,
 *         actual, week_start?, source, campaign_id?, project_id?, project_name? }] }
 */
export async function POST(req: NextRequest) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as KpiSyncPayload;
  try {
    const result = await syncKpiPayload(body);
    revalidateDashboard('kpi-sync');
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

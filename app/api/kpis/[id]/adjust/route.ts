import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { adjustKpiActual } from '@/lib/kpis';
import { currentWeekStart, supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const delta = typeof body?.delta === 'number' ? body.delta : 0;
  if (!Number.isFinite(delta) || delta === 0) {
    return NextResponse.json({ error: 'delta required (number, non-zero)' }, { status: 400 });
  }

  // Reject increments on auto-sourced KPIs — they read live from an external
  // system, so a manual delta would just be overwritten on next render.
  const { data: kpi, error: kpiErr } = await supabaseAdmin
    .from('kpis')
    .select('source')
    .eq('id', id)
    .maybeSingle();
  if (kpiErr) return NextResponse.json({ error: kpiErr.message }, { status: 500 });
  if (kpi && kpi.source && kpi.source !== 'manual') {
    return NextResponse.json(
      { error: `auto-tracked KPI (source=${kpi.source}) — manual adjust not allowed` },
      { status: 409 },
    );
  }

  const result = await adjustKpiActual(id, currentWeekStart(), delta);
  return NextResponse.json(result);
}

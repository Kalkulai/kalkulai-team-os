import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { updateKpiDefinition, setKpiTarget, deleteKpi } from '@/lib/kpis';
import { currentWeekStart } from '@/lib/supabase';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 });

  const defPatch: { name?: string; unit?: string; parent_id?: string | null } = {};
  if (typeof body.name === 'string' && body.name.trim()) defPatch.name = body.name.trim();
  if (typeof body.unit === 'string') defPatch.unit = body.unit.trim();
  if ('parent_id' in body) defPatch.parent_id = body.parent_id ?? null;

  if (Object.keys(defPatch).length > 0) await updateKpiDefinition(id, defPatch);

  if (typeof body.target === 'number' && body.target >= 0) {
    await setKpiTarget(id, currentWeekStart(), body.target);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  await deleteKpi(id);
  return NextResponse.json({ ok: true });
}

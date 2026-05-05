import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { listUserKpis, createKpi } from '@/lib/kpis';
import { currentWeekStart } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
  const kpis = await listUserKpis(userId, currentWeekStart());
  return NextResponse.json(kpis);
}

export async function POST(req: NextRequest) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body?.user_id || !body?.name?.trim()) {
    return NextResponse.json({ error: 'user_id and name required' }, { status: 400 });
  }
  const target = typeof body.target === 'number' && body.target >= 0 ? body.target : 0;
  const kpi = await createKpi({
    user_id: body.user_id,
    parent_id: body.parent_id ?? null,
    name: body.name.trim(),
    unit: typeof body.unit === 'string' ? body.unit.trim() : '',
    target,
    week_start: currentWeekStart(),
  });
  return NextResponse.json(kpi, { status: 201 });
}

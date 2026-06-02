import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { defaultStepStatus } from '@/lib/backlog-access';
import { listUserKpis, createKpi } from '@/lib/kpis';
import { currentWeekStart } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
  const kpis = await listUserKpis(userId, currentWeekStart());
  return NextResponse.json(kpis);
}

const ALLOWED_SOURCES = new Set(['manual', 'hubspot:calls-week']);

export async function POST(req: NextRequest) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body?.user_id || !body?.name?.trim()) {
    return NextResponse.json({ error: 'user_id and name required' }, { status: 400 });
  }
  const target = typeof body.target === 'number' && body.target >= 0 ? body.target : 0;
  const type = body.type === 'project' || body.type === 'step' ? body.type : 'counter';
  const due_date = typeof body.due_date === 'string' && body.due_date.length > 0 ? body.due_date : null;
  let source: 'manual' | 'hubspot:calls-week' = 'manual';
  if (typeof body.source === 'string') {
    if (!ALLOWED_SOURCES.has(body.source)) {
      return NextResponse.json(
        { error: `invalid source — allowed: ${[...ALLOWED_SOURCES].join(', ')}` },
        { status: 400 },
      );
    }
    source = body.source as typeof source;
  }
  const kpi = await createKpi({
    user_id: body.user_id,
    parent_id: body.parent_id ?? null,
    name: body.name.trim(),
    unit: typeof body.unit === 'string' ? body.unit.trim() : '',
    target,
    week_start: currentWeekStart(),
    type,
    due_date,
    source,
    status: type === 'step' ? defaultStepStatus(body.user_id) : null,
  });
  return NextResponse.json(kpi, { status: 201 });
}

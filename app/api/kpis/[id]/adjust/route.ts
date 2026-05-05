import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { adjustKpiActual } from '@/lib/kpis';
import { currentWeekStart } from '@/lib/supabase';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const delta = typeof body?.delta === 'number' ? body.delta : 0;
  if (!Number.isFinite(delta) || delta === 0) {
    return NextResponse.json({ error: 'delta required (number, non-zero)' }, { status: 400 });
  }
  const result = await adjustKpiActual(id, currentWeekStart(), delta);
  return NextResponse.json(result);
}

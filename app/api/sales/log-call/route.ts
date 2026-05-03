import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';

const ALLOWED_TYPES = ['cold-call', 'demo', 'follow-up'] as const;
type SalesLogType = (typeof ALLOWED_TYPES)[number];

function isAllowedType(value: unknown): value is SalesLogType {
  return typeof value === 'string' && (ALLOWED_TYPES as readonly string[]).includes(value);
}

export async function POST(req: NextRequest | Request) {
  if (!requireApiAuth(req as NextRequest)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.userId !== 'string' || !body.userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }
  if (!isAllowedType(body.type)) {
    return NextResponse.json(
      { error: `type must be one of: ${ALLOWED_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  const note = typeof body.note === 'string' ? body.note : null;

  const { data, error } = await supabaseAdmin.from('sales_logs').insert({
    user_id: body.userId,
    type: body.type,
    note,
  });

  if (error) {
    return NextResponse.json({ error: 'Datenbank-Fehler beim Speichern' }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, log: Array.isArray(data) ? data[0] : data },
    { status: 201 }
  );
}

import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import type { Contact, ContactUpsertInput } from '@/types/contact';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data, error } = await supabaseAdmin.from('contacts').select('*').order('name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json((data ?? []) as Contact[]);
}

export async function POST(req: NextRequest) {
  if (!requireApiAuth(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as ContactUpsertInput | null;
  if (!body?.id?.trim() || !body?.name?.trim()) {
    return NextResponse.json({ error: 'id and name required' }, { status: 400 });
  }

  const row = {
    ...body,
    id: body.id.trim(),
    name: body.name.trim(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin.from('contacts').upsert(row, { onConflict: 'id' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: row.id });
}

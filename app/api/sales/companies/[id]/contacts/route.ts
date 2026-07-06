import { NextRequest, NextResponse } from 'next/server';
import { requireActor } from '@/lib/auth-context';
import { createContact } from '@/lib/sales-os';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor(req, { allowMember: true, scopes: ['sales:write'] });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  if (!body.first_name && !body.last_name) {
    return NextResponse.json({ error: 'first_name or last_name required' }, { status: 400 });
  }
  const contact = await createContact(id, body);
  return NextResponse.json(contact, { status: 201 });
}

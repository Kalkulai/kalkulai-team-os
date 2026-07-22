import { NextRequest, NextResponse } from 'next/server';
import { requireActor } from '@/lib/auth-context';
import { createEndpoint } from '@/lib/sales-os';

export const dynamic = 'force-dynamic';

const VALID_CHANNELS = ['phone', 'mobile'] as const;
type Channel = (typeof VALID_CHANNELS)[number];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor(req, { allowMember: true, scopes: ['sales:write'] });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: companyId } = await params;
  const body = await req.json().catch(() => ({})) as {
    channel?: string;
    value?: string;
    contact_id?: string | null;
  };
  if (!body.value?.trim()) return NextResponse.json({ error: 'value required' }, { status: 400 });
  if (!VALID_CHANNELS.includes(body.channel as Channel)) {
    return NextResponse.json({ error: 'channel must be phone or mobile' }, { status: 400 });
  }
  try {
    await createEndpoint(companyId, {
      channel: body.channel as Channel,
      value: body.value,
      contactId: body.contact_id ?? null,
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error('createEndpoint failed:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { requireActor } from '@/lib/auth-context';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function sipgateHeaders() {
  const tokenId = process.env.SIPGATE_TOKEN_ID!;
  const token = process.env.SIPGATE_TOKEN!;
  return {
    Authorization: `Basic ${Buffer.from(`${tokenId}:${token}`).toString('base64')}`,
    'Content-Type': 'application/json',
  };
}

export async function POST(req: NextRequest) {
  const actor = await requireActor(req, { allowMember: true, scopes: ['sales:write'] });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { endpointId, companyId } = await req.json();
  if (!endpointId || !companyId) {
    return NextResponse.json({ error: 'endpointId and companyId required' }, { status: 400 });
  }

  const { data: endpoint, error } = await supabaseAdmin
    .from('sales_endpoints')
    .select('value, do_not_call')
    .eq('id', endpointId)
    .single();
  if (error || !endpoint) return NextResponse.json({ error: 'Endpoint not found' }, { status: 404 });
  if (endpoint.do_not_call) return NextResponse.json({ error: 'do_not_call' }, { status: 403 });

  const callerNumber = process.env.SIPGATE_CALLER_ID!;
  const deviceId = process.env.SIPGATE_DEVICE_ID ?? 'e0';
  const callee = endpoint.value.replace(/\s+/g, '');

  const requestBody = { caller: deviceId, callee, callerId: callerNumber };
  console.log('SipGate request body:', JSON.stringify(requestBody));

  const res = await fetch('https://api.sipgate.com/v2/sessions/calls', {
    method: 'POST',
    headers: sipgateHeaders(),
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const body = await res.text();
    const detail = `sipgate ${res.status} | sent: ${JSON.stringify(requestBody)} | response: "${body}"`;
    console.error(detail);
    return NextResponse.json({ error: detail }, { status: 502 });
  }

  const data = await res.json() as { sessionId?: string };

  await supabaseAdmin.from('sales_activities').insert({
    company_id: companyId,
    activity_type: 'call',
    direction: 'outbound',
    source_system: 'sipgate',
    provider_event_id: `sipgate-session-${data.sessionId ?? Date.now()}`,
    title: 'Ausgehender Call (sipgate)',
    occurred_at: new Date().toISOString(),
    meta: { sessionId: data.sessionId, callee: endpoint.value },
  });

  return NextResponse.json({ ok: true, sessionId: data.sessionId });
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// SipGate sends XML webhook events for call lifecycle.
// Supported event types: newCall, answer, hangup
// Docs: https://developer.sipgate.io/push-api/api-reference/

interface SipgateEvent {
  event: 'newCall' | 'answer' | 'hangup';
  callId: string;
  from?: string;
  to?: string;
  direction?: 'in' | 'out';
  duration?: string; // seconds as string, only on hangup
  cause?: string;    // hangup reason
}

function parseSipgateBody(body: string): SipgateEvent | null {
  try {
    // SipGate can send either JSON or URL-encoded form
    if (body.startsWith('{')) return JSON.parse(body) as SipgateEvent;
    const params = new URLSearchParams(body);
    return {
      event: params.get('event') as SipgateEvent['event'],
      callId: params.get('callId') ?? '',
      from: params.get('from') ?? undefined,
      to: params.get('to') ?? undefined,
      direction: (params.get('direction') ?? undefined) as SipgateEvent['direction'],
      duration: params.get('duration') ?? undefined,
      cause: params.get('cause') ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const event = parseSipgateBody(rawBody);

  if (!event?.callId) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }

  const providerId = `sipgate-session-${event.callId}`;

  if (event.event === 'answer') {
    const { data: existing } = await supabaseAdmin
      .from('sales_activities')
      .select('id, meta')
      .eq('provider_event_id', providerId)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from('sales_activities')
        .update({
          title: 'Ausgehender Call (verbunden)',
          meta: { ...(existing.meta as Record<string, unknown>), answered_at: new Date().toISOString() },
        })
        .eq('id', existing.id);
    }
  }

  if (event.event === 'hangup') {
    const duration = event.duration ? parseInt(event.duration, 10) : null;
    const reached = duration !== null && duration > 5;

    const { data: existing } = await supabaseAdmin
      .from('sales_activities')
      .select('id, meta, company_id')
      .eq('provider_event_id', providerId)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from('sales_activities')
        .update({
          title: reached
            ? `Ausgehender Call (${duration}s)`
            : `Ausgehender Call (nicht erreicht — ${event.cause ?? 'hangup'})`,
          summary: reached ? `Gespräch ${duration}s` : null,
          meta: {
            ...(existing.meta as Record<string, unknown>),
            duration_seconds: duration,
            hangup_cause: event.cause,
            reached,
            ended_at: new Date().toISOString(),
          },
        })
        .eq('id', existing.id);

      if (existing.company_id) {
        if (reached) {
          await supabaseAdmin
            .from('sales_companies')
            .update({ cold_streak: 0 })
            .eq('id', existing.company_id);
        } else {
          // Atomic increment without a stored function
          const { data: co } = await supabaseAdmin
            .from('sales_companies')
            .select('cold_streak')
            .eq('id', existing.company_id)
            .single();
          if (co) {
            await supabaseAdmin
              .from('sales_companies')
              .update({ cold_streak: (co.cold_streak as number ?? 0) + 1 })
              .eq('id', existing.company_id);
          }
        }
      }
    }
  }

  // SipGate expects 200 with optional XML response to control call routing
  return new NextResponse(null, { status: 200 });
}

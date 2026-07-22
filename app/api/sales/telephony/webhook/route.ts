import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendTelegramMessage } from '@/lib/telegram';
import { PAUL_MEMBER_ID } from '@/lib/sales-access';

export const dynamic = 'force-dynamic';

interface SipgateEvent {
  event: 'newCall' | 'answer' | 'hangup';
  callId: string;
  from?: string;
  to?: string;
  direction?: 'in' | 'out';
  duration?: string;
  cause?: string;
}

function parseSipgateBody(body: string): SipgateEvent | null {
  try {
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

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

// Match by last 9 digits to handle country-code variations (+49 vs 0 prefix)
function phonesMatch(a: string, b: string): boolean {
  const da = digitsOnly(a);
  const db = digitsOnly(b);
  if (da.length < 7 || db.length < 7) return false;
  const len = Math.min(9, Math.min(da.length, db.length));
  return da.slice(-len) === db.slice(-len);
}

interface EndpointRow {
  company_id: string;
  contact_id: string | null;
  value: string;
}

async function matchCallerToCompany(phone: string): Promise<{
  companyId: string;
  companyName: string;
  contactName: string | null;
  contactId: string | null;
} | null> {
  const { data: endpoints } = await supabaseAdmin
    .from('sales_endpoints')
    .select('company_id, contact_id, value')
    .in('channel', ['phone', 'mobile']);

  if (!endpoints?.length) return null;

  const match = (endpoints as EndpointRow[]).find((ep) => phonesMatch(ep.value, phone));
  if (!match) return null;

  const { data: company } = await supabaseAdmin
    .from('sales_companies')
    .select('name')
    .eq('id', match.company_id)
    .maybeSingle();

  let contactName: string | null = null;
  if (match.contact_id) {
    const { data: contact } = await supabaseAdmin
      .from('sales_contacts')
      .select('first_name, last_name')
      .eq('id', match.contact_id)
      .maybeSingle();
    if (contact) contactName = `${contact.first_name} ${contact.last_name}`.trim();
  }

  return {
    companyId: match.company_id,
    companyName: company?.name ?? 'Unbekannt',
    contactName,
    contactId: match.contact_id,
  };
}

async function getPaulTelegramId(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('team_members')
    .select('telegram_chat_id')
    .eq('id', PAUL_MEMBER_ID)
    .maybeSingle();
  return data?.telegram_chat_id ?? null;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const event = parseSipgateBody(rawBody);

  if (!event?.callId) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }

  const providerId = `sipgate-session-${event.callId}`;
  const isInbound = event.direction === 'in';

  // ── Inbound: neuer Anruf eingehend ──────────────────────────────────────
  if (event.event === 'newCall' && isInbound && event.from) {
    const caller = await matchCallerToCompany(event.from);

    // Activity anlegen
    await supabaseAdmin.from('sales_activities').upsert(
      {
        company_id: caller?.companyId ?? null,
        contact_id: caller?.contactId ?? null,
        activity_type: 'call',
        direction: 'inbound',
        occurred_at: new Date().toISOString(),
        source_system: 'sipgate',
        provider_event_id: providerId,
        title: caller
          ? `Eingehender Anruf — ${caller.companyName}${caller.contactName ? ` (${caller.contactName})` : ''}`
          : `Eingehender Anruf — Unbekannte Nummer`,
        meta: {
          from: event.from,
          to: event.to,
          matched: !!caller,
        },
      },
      { onConflict: 'provider_event_id', ignoreDuplicates: true },
    );

    // Telegram-Ping an Paul
    const telegramId = await getPaulTelegramId();
    if (telegramId) {
      const who = caller
        ? `*${caller.companyName}*${caller.contactName ? ` — ${caller.contactName}` : ''}`
        : `Unbekannte Nummer: \`${event.from}\``;
      await sendTelegramMessage(
        telegramId,
        `📞 *Eingehender Anruf*\n\n${who}\n\`${event.from}\``,
      );
    }
  }

  // ── Answer: Anruf angenommen ─────────────────────────────────────────────
  if (event.event === 'answer') {
    const { data: existing } = await supabaseAdmin
      .from('sales_activities')
      .select('id, meta, title')
      .eq('provider_event_id', providerId)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from('sales_activities')
        .update({
          title: existing.title?.replace('Eingehender Anruf', 'Eingehender Anruf (verbunden)')
                              .replace('Ausgehender Call', 'Ausgehender Call (verbunden)') ?? existing.title,
          meta: { ...(existing.meta as Record<string, unknown>), answered_at: new Date().toISOString() },
        })
        .eq('id', existing.id);
    }
  }

  // ── Hangup: Anruf beendet ────────────────────────────────────────────────
  if (event.event === 'hangup') {
    const duration = event.duration ? parseInt(event.duration, 10) : null;
    const reached = duration !== null && duration > 5;

    const { data: existing } = await supabaseAdmin
      .from('sales_activities')
      .select('id, meta, company_id')
      .eq('provider_event_id', providerId)
      .maybeSingle();

    if (existing) {
      const dirLabel = isInbound ? 'Eingehender Anruf' : 'Ausgehender Call';
      await supabaseAdmin
        .from('sales_activities')
        .update({
          title: reached
            ? `${dirLabel} (${duration}s)`
            : `${dirLabel} (nicht erreicht — ${event.cause ?? 'hangup'})`,
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

      // cold_streak nur für ausgehende Calls pflegen
      if (!isInbound && existing.company_id) {
        if (reached) {
          await supabaseAdmin
            .from('sales_companies')
            .update({ cold_streak: 0 })
            .eq('id', existing.company_id);
        } else {
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

  return new NextResponse(null, { status: 200 });
}

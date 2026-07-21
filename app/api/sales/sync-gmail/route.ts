import { NextRequest, NextResponse } from 'next/server';
import { requireActor } from '@/lib/auth-context';
import { supabaseAdmin } from '@/lib/supabase';
import { PAUL_MEMBER_ID } from '@/lib/sales-access';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface GmailThread {
  id: string;
  snippet: string;
}

interface GmailMessage {
  id: string;
  internalDate: string;
  payload?: {
    headers?: { name: string; value: string }[];
  };
}

interface GmailThreadDetail {
  id: string;
  messages?: GmailMessage[];
}

async function getAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Token refresh failed ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function searchThreads(
  accessToken: string,
  query: string,
): Promise<{ threads: GmailThread[]; gmailError?: string }> {
  const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/threads');
  url.searchParams.set('q', query);
  url.searchParams.set('maxResults', '5');
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { threads: [], gmailError: `HTTP ${res.status}: ${body.slice(0, 300)}` };
  }
  const data = (await res.json()) as { threads?: GmailThread[] };
  return { threads: data.threads ?? [] };
}

async function getThreadDetail(accessToken: string, threadId: string): Promise<GmailThreadDetail | null> {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}`);
  url.searchParams.set('format', 'metadata');
  for (const h of ['Subject', 'Date', 'From', 'To']) {
    url.searchParams.append('metadataHeaders', h);
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json() as Promise<GmailThreadDetail>;
}

function header(msg: GmailMessage, name: string): string {
  return msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

export async function POST(req: NextRequest) {
  const actor = await requireActor(req, { scopes: ['sales:write'] });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const memberId = PAUL_MEMBER_ID;
  const body = await req.json().catch(() => ({})) as { offset?: number; limit?: number };
  const offset = Math.max(0, body.offset ?? 0);
  const limit = Math.min(100, Math.max(1, body.limit ?? 75));

  // Fetch Paul's stored refresh token
  const { data: member, error: memberErr } = await supabaseAdmin
    .from('team_members')
    .select('google_refresh_token, google_calendar_email')
    .eq('id', memberId)
    .maybeSingle();

  if (memberErr) return NextResponse.json({ error: memberErr.message }, { status: 500 });
  if (!member?.google_refresh_token) {
    return NextResponse.json(
      { error: 'No Gmail token for Paul. Re-authorize at /settings to grant gmail.readonly access.' },
      { status: 400 }
    );
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken(member.google_refresh_token);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  // Get all email endpoints grouped by company (Paul's companies only), ordered for stable pagination
  const { data: endpoints, error: epErr } = await supabaseAdmin
    .from('sales_endpoints')
    .select('company_id, value, sales_companies!inner(owner_member_id)')
    .eq('channel', 'email')
    .eq('sales_companies.owner_member_id', memberId)
    .order('company_id');

  if (epErr) return NextResponse.json({ error: epErr.message }, { status: 500 });

  // Build ordered list of unique company IDs
  const emailsByCompany = new Map<string, string[]>();
  for (const ep of endpoints ?? []) {
    const list = emailsByCompany.get(ep.company_id) ?? [];
    list.push(ep.value);
    emailsByCompany.set(ep.company_id, list);
  }
  const companyIds = [...emailsByCompany.keys()];
  const batch = companyIds.slice(offset, offset + limit);
  const nextOffset = offset + limit < companyIds.length ? offset + limit : null;

  const paulEmail = member.google_calendar_email ?? 'paul@kalkulai.de';
  let synced = 0;
  let skipped = 0;
  const errors: string[] = [];
  let firstGmailError: string | null = null;

  for (const companyId of batch) {
    const emails = emailsByCompany.get(companyId)!;
    // Build search query: find threads involving any of the company's email addresses
    const emailTerms = emails.map((e) => `from:${e} OR to:${e}`).join(' OR ');
    const { threads, gmailError } = await searchThreads(accessToken, emailTerms);

    if (gmailError && !firstGmailError) {
      firstGmailError = gmailError;
    }
    if (threads.length === 0) { skipped++; continue; }

    // Take the most recent thread (Gmail returns newest first)
    const detail = await getThreadDetail(accessToken, threads[0].id);
    if (!detail?.messages?.length) { skipped++; continue; }

    // Most recent message in thread
    const messages = [...detail.messages].sort(
      (a, b) => Number(b.internalDate ?? 0) - Number(a.internalDate ?? 0)
    );
    const latest = messages[0];

    const fromAddr = header(latest, 'From').toLowerCase();
    const direction: 'inbound' | 'outbound' = fromAddr.includes(paulEmail.toLowerCase())
      ? 'outbound'
      : 'inbound';

    const subject = header(latest, 'Subject') || '(kein Betreff)';
    const occurredAt = latest.internalDate
      ? new Date(Number(latest.internalDate)).toISOString()
      : new Date().toISOString();

    // Upsert by provider_event_id = gmail thread ID
    const { error: upsertErr } = await supabaseAdmin.from('sales_activities').upsert(
      {
        company_id: companyId,
        activity_type: 'email',
        direction,
        occurred_at: occurredAt,
        source_system: 'gmail',
        provider_event_id: `gmail:${detail.id}`,
        title: subject,
        summary: threads[0].snippet ?? null,
        meta: {
          thread_id: detail.id,
          message_count: detail.messages?.length ?? 1,
          from: header(latest, 'From'),
          to: header(latest, 'To'),
        },
      },
      { onConflict: 'provider_event_id', ignoreDuplicates: false }
    );

    if (upsertErr) {
      errors.push(`${companyId}: ${upsertErr.message}`);
    } else {
      synced++;
    }
  }

  return NextResponse.json({
    ok: true,
    synced,
    skipped,
    errors,
    firstGmailError,
    offset,
    limit,
    total: companyIds.length,
    nextOffset,
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { runExtraction } from '@/lib/sales-insights';

export const dynamic = 'force-dynamic';

const CONVERSATIONS_DB_ID = 'bf7cb758547e48f1b64aa11a75f64203'; // hyphens stripped
const CHECKBOX_PROP = 'Call beendet 1';

// ---------------------------------------------------------------------------
// Notion API helpers
// ---------------------------------------------------------------------------

interface RichTextItem { plain_text: string }
interface NotionProp {
  type: string;
  checkbox?: boolean;
  title?: RichTextItem[];
  rich_text?: RichTextItem[];
  date?: { start: string } | null;
  select?: { name: string } | null;
  multi_select?: { name: string }[];
  relation?: { id: string }[];
}

interface NotionPage {
  id: string;
  url: string;
  parent: { type: string; database_id?: string };
  properties: Record<string, NotionProp>;
}

interface NotionBlock {
  id: string;
  type: string;
  has_children?: boolean;
  [key: string]: unknown;
}

async function notionGet<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Notion ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

function verifyNotionSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.NOTION_WEBHOOK_SECRET;
  if (!secret) return true; // dev mode: skip if not configured
  if (!header) return false;
  const [version, hash] = header.split('=');
  if (version !== 'v0' || !hash) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  try {
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Block text extraction (top-level only — summary blocks are not nested deeply)
// ---------------------------------------------------------------------------

function richText(arr: RichTextItem[] | undefined): string {
  return (arr ?? []).map((r) => r.plain_text).join('');
}

function extractBlockText(block: NotionBlock): string {
  const inner = block[block.type] as { rich_text?: RichTextItem[] } | undefined;
  return richText(inner?.rich_text);
}

// ---------------------------------------------------------------------------
// Company resolution: Customer relation page → sales_companies.id
// ---------------------------------------------------------------------------

async function resolveCompanyId(customerPageId: string): Promise<string | null> {
  let customerPage: NotionPage;
  try {
    customerPage = await notionGet<NotionPage>(`/pages/${customerPageId}`);
  } catch {
    return null;
  }

  // Try HubSpot ID if the Customers DB stores it as a property
  const hubspotProp = customerPage.properties?.['Hubspot id'] ?? customerPage.properties?.['HubSpot ID'];
  const hubspotId = richText(hubspotProp?.rich_text);
  if (hubspotId) {
    const { data } = await supabaseAdmin
      .from('sales_companies')
      .select('id')
      .eq('hubspot_company_id', hubspotId)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  // Fallback: match by company name from Notion page title
  const titleProp = Object.values(customerPage.properties ?? {}).find((p) => p.type === 'title');
  const name = richText(titleProp?.title);
  if (!name) return null;

  const cleanName = name.replace(/ \(https?:\/\/[^)]+\)/g, '').trim();
  const { data } = await supabaseAdmin
    .from('sales_companies')
    .select('id')
    .ilike('name', cleanName)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Notion sends the signature in `notion-signature` header
  const sig = req.headers.get('notion-signature');
  if (!verifyNotionSignature(rawBody, sig)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: {
    type?: string;
    challenge?: string;
    verification_token?: string;
    entity?: { id: string; type: string };
    data?: { parent?: { id?: string; type?: string }; updated_properties?: string[] };
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Notion sends a verification token when the webhook is first registered.
  // Token appears in Vercel logs — copy it into the Notion developer console.
  if (payload.verification_token) {
    console.log('[notion-webhook] VERIFICATION TOKEN:', payload.verification_token);
    return NextResponse.json({ ok: true });
  }

  // Legacy challenge format (Slack-style, just in case)
  if (payload.type === 'url_verification') {
    return NextResponse.json({ challenge: payload.challenge });
  }

  console.log('[notion-webhook] payload type:', payload.type, 'entity:', JSON.stringify(payload.entity));

  // Only care about page events
  if (payload.entity?.type !== 'page') {
    console.log('[notion-webhook] skipped: not a page event, entity type:', payload.entity?.type);
    return NextResponse.json({ ok: true, skipped: 'not a page event' });
  }

  const pageId = payload.entity.id;

  // Note: updated_properties contains property IDs not names, so we skip the fast-path
  // and always fetch the full page to check the checkbox state by name.
  console.log('[notion-webhook] pageId:', pageId, 'updated_properties:', payload.data?.updated_properties);

  try {
    const page = await notionGet<NotionPage>(`/pages/${pageId}`);

    // Verify page belongs to the Conversations DB
    const parentDbId = page.parent?.database_id?.replace(/-/g, '') ?? '';
    console.log('[notion-webhook] parentDbId:', parentDbId, 'expected:', CONVERSATIONS_DB_ID.replace(/-/g, ''));
    if (parentDbId !== CONVERSATIONS_DB_ID) {
      console.log('[notion-webhook] skipped: not conversations db');
      return NextResponse.json({ ok: true, skipped: 'not conversations db' });
    }

    // Only proceed if "Call beendet 1" is checked
    const checkboxProp = page.properties?.[CHECKBOX_PROP];
    console.log('[notion-webhook] checkbox value:', checkboxProp?.checkbox);
    if (!checkboxProp?.checkbox) {
      console.log('[notion-webhook] skipped: checkbox not ticked');
      return NextResponse.json({ ok: true, skipped: 'checkbox not ticked' });
    }

    // Extract page properties
    const props = page.properties;
    const title = richText(props?.Conversation?.title) || richText(props?.Name?.title) || 'Meeting';
    const dateStr = props?.['date:Date:start']?.date?.start ?? null;
    const summary = richText(props?.Summary?.rich_text);
    const keyTakeaways = richText(props?.['Key takeaways']?.rich_text);
    const tags = (props?.Tags?.multi_select ?? []).map((t) => t.name);
    const callType = props?.Type?.select?.name ?? 'Meeting';
    const customerRelation = props?.Customer?.relation ?? [];

    // Resolve company
    let companyId: string | null = null;
    if (customerRelation.length > 0) {
      companyId = await resolveCompanyId(customerRelation[0].id);
    }
    if (!companyId) {
      return NextResponse.json({ ok: false, error: 'Could not resolve company', pageId });
    }

    // Fetch page blocks for additional content (AI Meeting Notes summary paragraphs)
    let blockContent = '';
    try {
      const blocks = await notionGet<{ results: NotionBlock[] }>(`/blocks/${pageId}/children`);
      blockContent = (blocks.results ?? [])
        .map(extractBlockText)
        .filter(Boolean)
        .join('\n');
    } catch {
      // Non-critical — we still have the summary property
    }

    // Upsert to sales_activities (idempotent by provider_event_id)
    const providerId = `notion-${pageId.replace(/-/g, '')}`;
    const { error: upsertErr } = await supabaseAdmin
      .from('sales_activities')
      .upsert(
        {
          company_id: companyId,
          contact_id: null,
          activity_type: 'transcript',
          direction: 'inbound',
          occurred_at: dateStr ? new Date(dateStr).toISOString() : new Date().toISOString(),
          source_system: 'notion',
          provider_event_id: providerId,
          title,
          summary: summary || blockContent.slice(0, 4000) || null,
          meta: {
            key_takeaways: keyTakeaways || null,
            tags,
            call_type: callType,
            notion_url: page.url,
          },
        },
        { onConflict: 'provider_event_id' },
      );

    if (upsertErr) throw new Error(upsertErr.message);

    // Trigger immediate insights analysis for this company (fire-and-forget)
    runExtraction({ companyId, force: true }).catch(() => {});

    return NextResponse.json({ ok: true, imported: title, companyId });
  } catch (e) {
    console.error('[notion-webhook]', e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

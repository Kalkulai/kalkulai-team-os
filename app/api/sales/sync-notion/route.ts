import { NextRequest, NextResponse } from 'next/server';
import { requireActor } from '@/lib/auth-context';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CONVERSATIONS_DB_ID = 'bf7cb758-547e-48f1-b64a-a11a75f64203';

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

function richText(arr: RichTextItem[] | undefined): string {
  return (arr ?? []).map((r) => r.plain_text).join('');
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

async function resolveCompanyId(customerPageId: string): Promise<string | null> {
  let customerPage: NotionPage;
  try {
    customerPage = await notionGet<NotionPage>(`/pages/${customerPageId}`);
  } catch {
    return null;
  }

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

interface DirectConversation {
  notionUrl: string;
  title: string;
  summary: string | null;
  keyTakeaways: string | null;
  date: string | null;
  tags: string[];
  callType: string;
  customerPageId: string;
}

export async function POST(req: NextRequest) {
  const actor = await requireActor(req, { scopes: ['sales:write'] });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    cursor?: string;
    limit?: number;
    conversations?: DirectConversation[];
    allowEmpty?: boolean;
  };

  // Direct mode: conversations passed in body (bypasses Notion DB query)
  if (body.conversations) {
    let imported = 0, skipped = 0, failed = 0;
    const details: { title: string; status: string; reason?: string }[] = [];
    const allowEmpty = body.allowEmpty === true;

    for (const conv of body.conversations) {
      if (!allowEmpty && !conv.summary && !conv.keyTakeaways) {
        skipped++; details.push({ title: conv.title, status: 'skipped', reason: 'no content' }); continue;
      }
      const companyId = await resolveCompanyId(conv.customerPageId);
      if (!companyId) {
        failed++; details.push({ title: conv.title, status: 'failed', reason: 'company not found' }); continue;
      }
      const pageIdClean = conv.notionUrl.split('/').pop()?.replace(/-/g, '') ?? '';
      const providerId = `notion-${pageIdClean}`;
      const { error: upsertErr } = await supabaseAdmin.from('sales_activities').upsert(
        {
          company_id: companyId,
          contact_id: null,
          activity_type: 'transcript',
          direction: 'inbound',
          occurred_at: conv.date ? new Date(conv.date).toISOString() : new Date().toISOString(),
          source_system: 'notion',
          provider_event_id: providerId,
          title: conv.title,
          summary: conv.summary || null,
          meta: { key_takeaways: conv.keyTakeaways || null, tags: conv.tags, call_type: conv.callType, notion_url: conv.notionUrl },
        },
        { onConflict: 'provider_event_id', ignoreDuplicates: false },
      );
      if (upsertErr) { failed++; details.push({ title: conv.title, status: 'failed', reason: upsertErr.message }); }
      else { imported++; details.push({ title: conv.title, status: 'imported' }); }
    }
    return NextResponse.json({ ok: true, imported, skipped, failed, details });
  }

  const pageSize = Math.min(body.limit ?? 20, 20);
  const startCursor = body.cursor as string | undefined;

  // Fetch one page of conversations from Notion DB
  const queryBody: Record<string, unknown> = { page_size: pageSize };
  if (startCursor) queryBody.start_cursor = startCursor;

  const dbRes = await fetch(`https://api.notion.com/v1/databases/${CONVERSATIONS_DB_ID}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(queryBody),
    cache: 'no-store',
  });
  if (!dbRes.ok) {
    const text = await dbRes.text();
    return NextResponse.json({ error: `Notion query failed: ${dbRes.status} ${text.slice(0, 200)}` }, { status: 502 });
  }
  const dbData = (await dbRes.json()) as { results: NotionPage[]; has_more: boolean; next_cursor: string | null };

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const details: { title: string; status: string; reason?: string }[] = [];

  for (const page of dbData.results) {
    const props = page.properties;
    const title = richText(props?.Conversation?.title) || richText(props?.Name?.title) || 'Meeting';
    const customerRelation = props?.Customer?.relation ?? [];

    if (customerRelation.length === 0) {
      skipped++;
      details.push({ title, status: 'skipped', reason: 'no customer' });
      continue;
    }

    const summary = richText(props?.Summary?.rich_text);
    const keyTakeaways = richText(props?.['Key takeaways']?.rich_text);

    // Skip if both summary and key takeaways are empty
    if (!summary && !keyTakeaways) {
      skipped++;
      details.push({ title, status: 'skipped', reason: 'no content' });
      continue;
    }

    const companyId = await resolveCompanyId(customerRelation[0].id);
    if (!companyId) {
      failed++;
      details.push({ title, status: 'failed', reason: 'company not found' });
      continue;
    }

    const dateStr = props?.['date:Date:start']?.date?.start ?? null;
    const tags = (props?.Tags?.multi_select ?? []).map((t) => t.name);
    const callType = props?.Type?.select?.name ?? 'Meeting';
    const providerId = `notion-${page.id.replace(/-/g, '')}`;

    const { error: upsertErr } = await supabaseAdmin.from('sales_activities').upsert(
      {
        company_id: companyId,
        contact_id: null,
        activity_type: 'transcript',
        direction: 'inbound',
        occurred_at: dateStr ? new Date(dateStr).toISOString() : new Date().toISOString(),
        source_system: 'notion',
        provider_event_id: providerId,
        title,
        summary: summary || null,
        meta: {
          key_takeaways: keyTakeaways || null,
          tags,
          call_type: callType,
          notion_url: page.url,
        },
      },
      { onConflict: 'provider_event_id', ignoreDuplicates: false },
    );

    if (upsertErr) {
      failed++;
      details.push({ title, status: 'failed', reason: upsertErr.message });
    } else {
      imported++;
      details.push({ title, status: 'imported' });
    }
  }

  return NextResponse.json({
    ok: true,
    imported,
    skipped,
    failed,
    details,
    hasMore: dbData.has_more,
    nextCursor: dbData.next_cursor ?? null,
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { requireActor, hasValidServiceBearer } from '@/lib/auth-context';
import {
  mapHubspotCompany, mapHubspotContact, extractEndpoints, mapHubspotEngagementV1,
  HubspotObject,
} from '@/lib/sales-hubspot-map';
import {
  upsertCompanyFromHubspot, upsertContactFromHubspot, upsertEndpoint,
  upsertActivity, logSyncActivity,
} from '@/lib/sales-os';
import { PAUL_MEMBER_ID } from '@/lib/sales-access';

export const dynamic = 'force-dynamic';
export const maxDuration = 240;

const BASE = 'https://api.hubapi.com';
const COMPANY_PROPS = 'name,domain,industry,lifecyclestage,phone';
const CONTACT_PROPS = ['firstname', 'lastname', 'jobtitle', 'email', 'phone', 'mobilephone'];

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

async function hsPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HubSpot POST ${path} failed: ${res.status}`);
  return res.json();
}

const PAGE_SIZE = 25;

async function fetchCompaniesPage(after?: string): Promise<{ companies: HubspotObject[]; nextAfter: string | null }> {
  const url = new URL(`${BASE}/crm/v3/objects/companies`);
  url.searchParams.set('limit', String(PAGE_SIZE));
  url.searchParams.set('properties', COMPANY_PROPS);
  if (after) url.searchParams.set('after', after);
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HubSpot companies failed: ${res.status}`);
  const data = await res.json();
  return {
    companies: data.results ?? [],
    nextAfter: data.paging?.next?.after ?? null,
  };
}

// Batch associations API: 2 calls for 152 companies instead of 152 individual calls
async function fetchAllContactAssociations(companyIds: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  for (let i = 0; i < companyIds.length; i += 100) {
    const data = await hsPost('/crm/v4/associations/companies/contacts/batch/read', {
      inputs: companyIds.slice(i, i + 100).map((id) => ({ id })),
    }) as { results?: Array<{ from: { id: string }; to: Array<{ toObjectId: number }> }> };
    for (const item of data.results ?? []) {
      result.set(String(item.from.id), (item.to ?? []).map((t) => String(t.toObjectId)));
    }
  }
  return result;
}

async function batchReadContacts(ids: string[]): Promise<HubspotObject[]> {
  const results: HubspotObject[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const data = await hsPost('/crm/v3/objects/contacts/batch/read', {
      properties: CONTACT_PROPS,
      inputs: ids.slice(i, i + 100).map((id) => ({ id })),
    }) as { results?: HubspotObject[] };
    results.push(...(data.results ?? []));
  }
  return results;
}

async function fetchEngagementsV1(companyId: string): Promise<unknown[]> {
  const all: unknown[] = [];
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const url = new URL(`${BASE}/engagements/v1/engagements/associated/COMPANY/${companyId}/paged`);
    url.searchParams.set('limit', '100');
    if (offset) url.searchParams.set('offset', String(offset));
    const res = await fetch(url, { headers: authHeaders() });
    if (res.status === 429) {
      const wait = parseInt(res.headers.get('Retry-After') ?? '5', 10);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`HubSpot engagements v1 failed: ${res.status}`);
    const data = await res.json();
    all.push(...(data.results ?? []));
    hasMore = data.hasMore ?? false;
    offset = data.offset ?? 0;
  }
  return all;
}

export async function POST(req: NextRequest) {
  const actor = await requireActor(req, { allowMember: true, scopes: ['sales:write'] });
  if (!actor && !hasValidServiceBearer(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const stats = { companies: 0, contacts: 0, endpoints: 0, activities: 0 };
    const body = await req.json().catch(() => ({}));
    const after = typeof body?.after === 'string' ? body.after : undefined;

    // Phase 1: fetch ONE page of companies (chunked — Vercel Hobby kills at 60s,
    // so callers loop over pages via the returned nextAfter cursor)
    const { companies, nextAfter } = await fetchCompaniesPage(after);

    // Phase 2: batch fetch contact associations for this page (1 API call)
    const contactAssocMap = await fetchAllContactAssociations(companies.map((c) => c.id));

    // Phase 3: batch fetch ALL unique contacts (2 API calls total)
    const allContactIds = [...new Set([...contactAssocMap.values()].flat())];
    const allContacts = allContactIds.length ? await batchReadContacts(allContactIds) : [];
    const contactById = new Map(allContacts.map((c) => [c.id, c]));

    // Phase 4: write companies + contacts + endpoints to DB (no HubSpot calls)
    const companyDbIdMap = new Map<string, string>();
    for (const hsCompany of companies) {
      const companyId = await upsertCompanyFromHubspot(mapHubspotCompany(hsCompany, PAUL_MEMBER_ID));
      companyDbIdMap.set(hsCompany.id, companyId);

      const contactIds = contactAssocMap.get(hsCompany.id) ?? [];
      const hsContacts = contactIds.map((id) => contactById.get(id)).filter(Boolean) as HubspotObject[];
      const contactIdByHubspotId = new Map<string, string>();

      for (const hsContact of hsContacts) {
        const contactId = await upsertContactFromHubspot(companyId, mapHubspotContact(hsContact));
        contactIdByHubspotId.set(hsContact.id, contactId);
        stats.contacts += 1;
      }
      for (const draft of extractEndpoints(hsCompany, hsContacts)) {
        await upsertEndpoint(
          companyId,
          draft.contactHubspotId ? contactIdByHubspotId.get(draft.contactHubspotId) ?? null : null,
          { channel: draft.channel, value: draft.value, endpoint_type: draft.endpoint_type },
        );
        stats.endpoints += 1;
      }
      stats.companies += 1;
    }

    // Phase 5: fetch engagements per company sequentially (1 call/company, retry on 429)
    for (const hsCompany of companies) {
      const companyId = companyDbIdMap.get(hsCompany.id)!;
      const engagements = await fetchEngagementsV1(hsCompany.id);
      for (const engagement of engagements) {
        await upsertActivity(companyId, null, mapHubspotEngagementV1(
          engagement as Parameters<typeof mapHubspotEngagementV1>[0],
        ));
        stats.activities += 1;
      }
      await logSyncActivity(companyId, hsCompany.id);
    }

    return NextResponse.json({ ok: true, stats, nextAfter });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[sales/sync] error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

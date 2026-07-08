import { NextRequest, NextResponse } from 'next/server';
import { requireActor } from '@/lib/auth-context';
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

async function hsGet(path: string, params: Record<string, string>) {
  const url = new URL(`${BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HubSpot ${path} failed: ${res.status}`);
  return res.json();
}

async function fetchAllCompanies(): Promise<HubspotObject[]> {
  const all: HubspotObject[] = [];
  let after: string | undefined;
  do {
    const data = await hsGet('/crm/v3/objects/companies', {
      limit: '100', properties: COMPANY_PROPS, ...(after ? { after } : {}),
    });
    all.push(...(data.results ?? []));
    after = data.paging?.next?.after;
  } while (after);
  return all;
}

async function fetchAssociatedIds(companyId: string, toObject: string): Promise<string[]> {
  const data = await hsGet(`/crm/v3/objects/companies/${companyId}/associations/${toObject}`, {});
  return (data.results ?? []).map((a: { id: string }) => a.id);
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
    if (!res.ok) throw new Error(`HubSpot engagements v1 failed: ${res.status}`);
    const data = await res.json();
    all.push(...(data.results ?? []));
    hasMore = data.hasMore ?? false;
    offset = data.offset ?? 0;
  }
  return all;
}

async function batchRead(objectType: string, ids: string[], properties: string[]): Promise<HubspotObject[]> {
  const results: HubspotObject[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const res = await fetch(`${BASE}/crm/v3/objects/${objectType}/batch/read`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ properties, inputs: ids.slice(i, i + 100).map((id) => ({ id })) }),
    });
    if (!res.ok) throw new Error(`HubSpot batch read ${objectType} failed: ${res.status}`);
    results.push(...((await res.json()).results ?? []));
  }
  return results;
}

const CONCURRENCY = 10;

async function syncOneCompany(
  hsCompany: HubspotObject,
  stats: { companies: number; contacts: number; endpoints: number; activities: number },
): Promise<void> {
  const companyId = await upsertCompanyFromHubspot(mapHubspotCompany(hsCompany, PAUL_MEMBER_ID));

  const [contactIds, engagements] = await Promise.all([
    fetchAssociatedIds(hsCompany.id, 'contacts'),
    fetchEngagementsV1(hsCompany.id),
  ]);

  const hsContacts = contactIds.length ? await batchRead('contacts', contactIds, CONTACT_PROPS) : [];
  const contactIdByHubspotId = new Map<string, string>();
  for (const hsContact of hsContacts) {
    const contactId = await upsertContactFromHubspot(companyId, mapHubspotContact(hsContact));
    contactIdByHubspotId.set(hsContact.id, contactId);
    stats.contacts += 1;
  }

  const endpointDrafts = extractEndpoints(hsCompany, hsContacts);
  await Promise.all([
    ...endpointDrafts.map(async (draft) => {
      await upsertEndpoint(
        companyId,
        draft.contactHubspotId ? contactIdByHubspotId.get(draft.contactHubspotId) ?? null : null,
        { channel: draft.channel, value: draft.value, endpoint_type: draft.endpoint_type },
      );
      stats.endpoints += 1;
    }),
    ...engagements.map(async (engagement) => {
      await upsertActivity(companyId, null, mapHubspotEngagementV1(engagement as Parameters<typeof mapHubspotEngagementV1>[0]));
      stats.activities += 1;
    }),
  ]);

  await logSyncActivity(companyId, hsCompany.id);
  stats.companies += 1;
}

export async function POST(req: NextRequest) {
  const actor = await requireActor(req, { allowMember: true, scopes: ['sales:write'] });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const stats = { companies: 0, contacts: 0, endpoints: 0, activities: 0 };
    const companies = await fetchAllCompanies();
    for (let i = 0; i < companies.length; i += CONCURRENCY) {
      await Promise.all(companies.slice(i, i + CONCURRENCY).map((c) => syncOneCompany(c, stats)));
    }
    return NextResponse.json({ ok: true, stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[sales/sync] error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

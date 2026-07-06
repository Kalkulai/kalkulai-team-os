import { NextRequest, NextResponse } from 'next/server';
import { requireActor } from '@/lib/auth-context';
import {
  mapHubspotCompany, mapHubspotContact, extractEndpoints, mapHubspotEngagement,
  HubspotObject, EngagementKind,
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
const ENGAGEMENT_KINDS: EngagementKind[] = ['notes', 'calls', 'emails', 'tasks', 'meetings'];
const ENGAGEMENT_PROPS: Record<EngagementKind, string[]> = {
  notes: ['hs_note_body', 'hs_timestamp'],
  calls: ['hs_call_title', 'hs_call_body', 'hs_timestamp'],
  emails: ['hs_email_subject', 'hs_email_text', 'hs_timestamp'],
  tasks: ['hs_task_subject', 'hs_task_body', 'hs_timestamp'],
  meetings: ['hs_meeting_title', 'hs_meeting_body', 'hs_timestamp'],
};

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

export async function POST(req: NextRequest) {
  const actor = await requireActor(req, { allowMember: true, scopes: ['sales:write'] });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const stats = { companies: 0, contacts: 0, endpoints: 0, activities: 0 };
    for (const hsCompany of await fetchAllCompanies()) {
      const companyId = await upsertCompanyFromHubspot(mapHubspotCompany(hsCompany, PAUL_MEMBER_ID));

      const contactIds = await fetchAssociatedIds(hsCompany.id, 'contacts');
      const hsContacts = contactIds.length ? await batchRead('contacts', contactIds, CONTACT_PROPS) : [];
      const contactIdByHubspotId = new Map<string, string>();
      for (const hsContact of hsContacts) {
        const contactId = await upsertContactFromHubspot(companyId, mapHubspotContact(hsContact));
        contactIdByHubspotId.set(hsContact.id, contactId);
        stats.contacts += 1;
      }

      for (const draft of extractEndpoints(hsCompany, hsContacts)) {
        await upsertEndpoint(companyId,
          draft.contactHubspotId ? contactIdByHubspotId.get(draft.contactHubspotId) ?? null : null,
          { channel: draft.channel, value: draft.value, endpoint_type: draft.endpoint_type });
        stats.endpoints += 1;
      }

      // Protokolle: alle Engagement-Typen als Timeline-Activities (Entscheidung 1)
      for (const kind of ENGAGEMENT_KINDS) {
        const engagementIds = await fetchAssociatedIds(hsCompany.id, kind);
        if (engagementIds.length === 0) continue;
        const engagements = await batchRead(kind, engagementIds, ENGAGEMENT_PROPS[kind]);
        for (const engagement of engagements) {
          await upsertActivity(companyId, null, mapHubspotEngagement(kind, engagement));
          stats.activities += 1;
        }
      }

      await logSyncActivity(companyId, hsCompany.id);
      stats.companies += 1;
    }
    return NextResponse.json({ ok: true, stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[sales/sync] error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

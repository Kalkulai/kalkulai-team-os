import type { HubSpotCall } from '@/types';
import { startOfWeek } from 'date-fns';

const HS_BASE = 'https://api.hubapi.com';

async function hsPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${HS_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN!}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HubSpot ${res.status}: ${path} — ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export interface HubSpotTaskResult {
  id: string;
}

export async function createHubSpotTask(args: {
  ownerId: string;
  subject: string;
  body: string;
  dueAt: string;
}): Promise<HubSpotTaskResult> {
  type TaskResp = { id: string };
  const data = await hsPost<TaskResp>('/crm/v3/objects/tasks', {
    properties: {
      hs_task_subject: args.subject,
      hs_task_body: args.body,
      hs_timestamp: args.dueAt,
      hs_task_status: 'NOT_STARTED',
      hs_task_priority: 'HIGH',
      hubspot_owner_id: args.ownerId,
    },
  });
  return { id: data.id };
}

/**
 * All HubSpot Calls created by `hubspotOwnerId` since `since` (or Monday this
 * week if `since` is omitted or earlier than Monday).
 *
 * For KPIs created mid-week, callers pass the kpi.created_at so the counter
 * doesn't retroactively include calls logged before the KPI even existed.
 * Once the next week starts, Monday wins again and counting resets normally.
 *
 * Uses the server-side Search API — the flat `/crm/v3/objects/calls?limit=100`
 * endpoint paginates over ALL calls in the account, so per-owner subsets get
 * silently truncated for accounts with >100 historical calls. Search lets
 * HubSpot filter server-side.
 *
 * Pagination: walks all matching pages (HubSpot's max page size is 100;
 * safety-capped at 10 pages = 1000 calls/window, above realistic counts).
 */
export async function getCallsThisWeek(
  hubspotOwnerId: string,
  since?: Date,
): Promise<HubSpotCall[]> {
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
  monday.setHours(0, 0, 0, 0);
  const effectiveSince = since && since > monday ? since : monday;
  const sinceIso = effectiveSince.toISOString();

  type SearchResp = {
    results: Array<{
      id: string;
      properties: {
        hs_timestamp: string;
        hs_call_duration: string | null;
        hubspot_owner_id: string;
      };
    }>;
    paging?: { next?: { after?: string } };
  };

  const out: HubSpotCall[] = [];
  let after: string | undefined;
  for (let i = 0; i < 10; i++) {
    const body = {
      filterGroups: [
        {
          filters: [
            { propertyName: 'hubspot_owner_id', operator: 'EQ', value: hubspotOwnerId },
            { propertyName: 'hs_timestamp', operator: 'GTE', value: sinceIso },
          ],
        },
      ],
      properties: ['hs_timestamp', 'hs_call_duration', 'hubspot_owner_id'],
      limit: 100,
      ...(after ? { after } : {}),
    };
    const data = await hsPost<SearchResp>('/crm/v3/objects/calls/search', body);
    for (const c of data.results ?? []) {
      out.push({
        id: c.id,
        timestamp: c.properties.hs_timestamp,
        duration: parseInt(c.properties.hs_call_duration ?? '0', 10),
        ownerId: c.properties.hubspot_owner_id,
      });
    }
    after = data.paging?.next?.after;
    if (!after) break;
  }
  return out;
}

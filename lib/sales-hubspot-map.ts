export interface HubspotObject {
  id: string;
  properties: Record<string, string | null | undefined>;
}

export interface EndpointDraft {
  channel: 'phone' | 'mobile' | 'email';
  value: string;
  endpoint_type: 'switchboard' | 'direct' | 'mobile';
  contactHubspotId: string | null;
}

export type EngagementKind = 'notes' | 'calls' | 'emails' | 'tasks' | 'meetings';

const ENGAGEMENT_ACTIVITY: Record<EngagementKind, string> = {
  notes: 'note', calls: 'call', emails: 'email', tasks: 'task', meetings: 'meeting',
};

const ENGAGEMENT_TITLE: Record<EngagementKind, string> = {
  notes: 'Notiz (HubSpot)', calls: 'Call (HubSpot)', emails: 'E-Mail (HubSpot)',
  tasks: 'Task (HubSpot)', meetings: 'Meeting (HubSpot)',
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function mapHubspotCompany(company: HubspotObject, ownerMemberId: string) {
  const p = company.properties;
  return {
    hubspot_company_id: company.id,
    owner_member_id: ownerMemberId,
    name: p.name || `Unbenannt ${company.id}`,
    website: p.domain ? `https://${p.domain}` : null,
    industry: p.industry || null,
    status: p.lifecyclestage || 'lead',
    updated_at: new Date().toISOString(),
  };
}

export function mapHubspotContact(contact: HubspotObject) {
  const p = contact.properties;
  return {
    hubspot_contact_id: contact.id,
    first_name: p.firstname || '',
    last_name: p.lastname || '',
    role: p.jobtitle || null,
    email: p.email || null,
    recording_consent: true, // Entscheidung 5: Imports gelten als consented
  };
}

export function extractEndpoints(company: HubspotObject, contacts: HubspotObject[]): EndpointDraft[] {
  const endpoints: EndpointDraft[] = [];
  if (company.properties.phone) {
    endpoints.push({
      channel: 'phone', value: company.properties.phone,
      endpoint_type: 'switchboard', contactHubspotId: null,
    });
  }
  for (const contact of contacts) {
    if (contact.properties.phone) {
      endpoints.push({
        channel: 'phone', value: contact.properties.phone,
        endpoint_type: 'direct', contactHubspotId: contact.id,
      });
    }
    if (contact.properties.mobilephone) {
      endpoints.push({
        channel: 'mobile', value: contact.properties.mobilephone,
        endpoint_type: 'mobile', contactHubspotId: contact.id,
      });
    }
    if (contact.properties.email) {
      endpoints.push({
        channel: 'email', value: contact.properties.email,
        endpoint_type: 'direct', contactHubspotId: contact.id,
      });
    }
  }
  return endpoints;
}

export function mapHubspotEngagement(kind: EngagementKind, engagement: HubspotObject) {
  const p = engagement.properties;
  const body = p.hs_note_body || p.hs_call_body || p.hs_email_text || p.hs_task_body
    || p.hs_meeting_body || '';
  const title = p.hs_call_title || p.hs_email_subject || p.hs_task_subject
    || p.hs_meeting_title || ENGAGEMENT_TITLE[kind];
  return {
    activity_type: ENGAGEMENT_ACTIVITY[kind],
    direction: null as string | null,
    occurred_at: p.hs_timestamp || new Date().toISOString(),
    source_system: 'hubspot',
    provider_event_id: `hubspot-${kind}-${engagement.id}`,
    title,
    summary: body ? stripHtml(body).slice(0, 4000) : null,
    meta: {},
  };
}

const V1_TYPE_TO_KIND: Record<string, EngagementKind> = {
  NOTE: 'notes', CALL: 'calls', EMAIL: 'emails', TASK: 'tasks', MEETING: 'meetings',
};

export function mapHubspotEngagementV1(raw: {
  engagement: { id: number; type: string; timestamp?: number };
  metadata?: Record<string, string | undefined>;
}) {
  const e = raw.engagement;
  const m = raw.metadata ?? {};
  const kind: EngagementKind = V1_TYPE_TO_KIND[e.type] ?? 'notes';
  const body = m.body || m.text || m.html || '';
  const title = m.title || m.subject || ENGAGEMENT_TITLE[kind];
  return {
    activity_type: ENGAGEMENT_ACTIVITY[kind],
    direction: (m.direction ?? null) as string | null,
    occurred_at: e.timestamp ? new Date(e.timestamp).toISOString() : new Date().toISOString(),
    source_system: 'hubspot',
    provider_event_id: `hubspot-${kind}-${e.id}`,
    title,
    summary: body ? stripHtml(body).slice(0, 4000) : null,
    meta: {},
  };
}

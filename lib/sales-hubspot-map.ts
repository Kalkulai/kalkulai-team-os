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
    name: (p.name || `Unbenannt ${company.id}`).replace(/ \(https:\/\/www\.notion\.so\/[^)]+\)/g, '').trim(),
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

// Direct v1 engagement type → activity_type mapping. Unknown types fall back to
// 'note' but keep the original type in the title so nothing is silently mislabeled.
const V1_TYPE_MAP: Record<string, { activity: string; title: string; direction?: string }> = {
  NOTE: { activity: 'note', title: 'Notiz (HubSpot)' },
  CALL: { activity: 'call', title: 'Call (HubSpot)' },
  EMAIL: { activity: 'email', title: 'E-Mail (HubSpot)', direction: 'outbound' },
  INCOMING_EMAIL: { activity: 'email', title: 'E-Mail eingehend (HubSpot)', direction: 'inbound' },
  FORWARDED_EMAIL: { activity: 'email', title: 'E-Mail weitergeleitet (HubSpot)' },
  TASK: { activity: 'task', title: 'Task (HubSpot)' },
  MEETING: { activity: 'meeting', title: 'Meeting (HubSpot)' },
  WHATS_APP: { activity: 'whatsapp', title: 'WhatsApp (HubSpot)' },
  SMS: { activity: 'whatsapp', title: 'SMS (HubSpot)' },
  LINKEDIN_MESSAGE: { activity: 'note', title: 'LinkedIn-Nachricht (HubSpot)' },
};

export function mapHubspotEngagementV1(raw: {
  engagement: { id: number; type: string; timestamp?: number };
  metadata?: Record<string, string | undefined>;
}) {
  const e = raw.engagement;
  const m = raw.metadata ?? {};
  const mapped = V1_TYPE_MAP[e.type] ?? { activity: 'note', title: `${e.type} (HubSpot)` };
  const body = m.body || m.text || m.html || '';
  const title = m.title || m.subject || mapped.title;
  const rawDir = m.direction?.toLowerCase() ?? mapped.direction ?? null;
  return {
    activity_type: mapped.activity,
    direction: rawDir && ['inbound', 'outbound', 'internal'].includes(rawDir) ? rawDir : null,
    occurred_at: e.timestamp ? new Date(e.timestamp).toISOString() : new Date().toISOString(),
    source_system: 'hubspot',
    provider_event_id: `hubspot-${e.type.toLowerCase()}-${e.id}`,
    title,
    summary: body ? stripHtml(body).slice(0, 4000) : null,
    meta: { hubspot_engagement_type: e.type },
  };
}

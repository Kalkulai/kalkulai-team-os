export type SalesCompanyStatus = string; // HubSpot lifecyclestage passthrough (raw)
export type SalesStage =
  | 'prospecting'
  | 'discovery'
  | 'evaluation'
  | 'pilot'
  | 'expansion'
  | 'customer'
  | 'disqualified';

export type EndpointChannel = 'phone' | 'mobile' | 'whatsapp' | 'email' | 'linkedin';
export type EndpointType = 'direct' | 'mobile' | 'switchboard' | 'assistant' | 'location' | 'generic';
export type ActivityType = 'call' | 'email' | 'whatsapp' | 'meeting' | 'task' | 'note' | 'transcript' | 'sync';
export type RelationshipHealth = 'green' | 'yellow' | 'red';

export interface SalesCompanyInsights {
  employee_count: number | null;
  software_used: string[];
  interests: string[];
  buying_signal: 'hot' | 'warm' | 'cold' | 'unknown';
  pain_points: string[];
  notes: string | null;
  last_analyzed_at: string | null;
}

export interface SalesCompany {
  id: string;
  owner_member_id: string;
  hubspot_company_id: string | null;
  name: string;
  website: string | null;
  industry: string | null;
  status: SalesCompanyStatus;
  stage: SalesStage;
  stage_entered_at: string | null;
  next_step: string | null;
  insights_json: SalesCompanyInsights | null;
  pilot_status: 'active' | 'committed' | null;
  ai_summary: string | null;
  cold_streak: number;
  created_at: string;
  updated_at: string;
}

export interface SalesContact {
  id: string;
  company_id: string;
  hubspot_contact_id: string | null;
  first_name: string;
  last_name: string;
  role: string | null;
  email: string | null;
  recording_consent: boolean;
}

export interface SalesEndpoint {
  id: string;
  company_id: string;
  contact_id: string | null;
  channel: EndpointChannel;
  value: string;
  endpoint_type: EndpointType;
  source: string;
  validity_status: 'unverified' | 'verified' | 'invalid';
  do_not_call: boolean;
  priority: number;
}

export interface SalesActivity {
  id: string;
  company_id: string;
  contact_id: string | null;
  activity_type: ActivityType;
  direction: 'inbound' | 'outbound' | 'internal' | null;
  occurred_at: string;
  source_system: string;
  provider_event_id: string | null;
  title: string;
  summary: string | null;
  meta: Record<string, unknown>;
}

export interface SalesCompanyListItem extends SalesCompany {
  contact_count: number;
  last_activity_at: string | null;
  last_activity_type: string | null;
  days_since_contact: number | null;
  priority_score: number;
  transcript_count: number;
  first_phone: string | null;
  first_phone_channel: string | null;
  relationship_health: RelationshipHealth;
}

export interface SalesCompanyDetail extends SalesCompany {
  contacts: SalesContact[];
  endpoints: SalesEndpoint[];
  activities: SalesActivity[];
}

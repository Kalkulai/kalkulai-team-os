import { supabaseAdmin } from '@/lib/supabase';
import { createHubSpotTask } from '@/lib/hubspot';
import { createLinearFollowupTask } from '@/lib/campaign-task-routing';

export type CampaignType = 'partnerships' | 'handwerker';
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'done' | 'archived';
export type CampaignLeadStage =
  | 'sourced'
  | 'ready'
  | 'sent'
  | 'replied'
  | 'followup_due'
  | 'meeting_booked'
  | 'blocked'
  | 'disqualified';
export type CampaignEventType =
  | 'sent'
  | 'replied'
  | 'opened'
  | 'followup_due'
  | 'meeting_booked'
  | 'blocked'
  | 'note';

export interface CampaignRow {
  id: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  owner_member_id: string | null;
  source?: string | null;
  external_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CampaignLeadRow {
  id: string;
  campaign_id: string;
  display_name: string | null;
  company_name?: string | null;
  email?: string | null;
  owner_member_id?: string | null;
  external_system?: string | null;
  external_id?: string | null;
  stage: CampaignLeadStage;
  next_action?: string | null;
  next_action_at?: string | null;
  last_touch_at?: string | null;
  source?: string | null;
  meta?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

export interface CampaignEventRow {
  id?: string;
  campaign_id: string;
  lead_id?: string | null;
  event_type: CampaignEventType;
  occurred_at?: string | null;
  source?: string | null;
  external_id?: string | null;
  summary?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface CampaignStats {
  sent: number;
  replies: number;
  replyRate: number | null;
  opens: number;
  openRate: number | null;
  followupsDue: number;
  blocked: number;
}

export interface CampaignSummary extends CampaignRow {
  stats: CampaignStats;
  leadCount: number;
}

export interface CampaignDetail extends CampaignSummary {
  leads: Array<CampaignLeadRow & { events: CampaignEventRow[] }>;
}

export interface CampaignRouteAction {
  campaignId: string;
  leadId: string;
  actionType: 'hubspot_task' | 'linear_task';
  idempotencyKey: string;
  externalId: string | null;
  status: 'created' | 'skipped';
  reason?: string;
}

export interface CampaignSyncPayload {
  campaigns?: Partial<CampaignRow>[];
  leads?: Partial<CampaignLeadRow>[];
  events?: Partial<CampaignEventRow>[];
}

export interface CampaignSyncResult {
  campaigns: number;
  leads: number;
  events: number;
}

interface TeamMemberLite {
  id: string;
  linear_user_id: string | null;
  hubspot_owner_id: string | null;
}

function withoutUndefined<T extends Record<string, unknown>>(row: T): T {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined)) as T;
}

function requireExternalIdentity(
  rows: Array<Partial<{ source: string | null; external_id: string | null }>>,
  table: string,
): void {
  const missing = rows.find((row) => !row.source || !row.external_id);
  if (missing) throw new Error(`${table} sync rows need source and external_id`);
}

function requireLeadExternalIdentity(rows: Array<Partial<CampaignLeadRow>>): void {
  const missing = rows.find((row) => !row.campaign_id || !row.external_system || !row.external_id);
  if (missing) throw new Error('campaign_leads sync rows need campaign_id, external_system and external_id');
}

export async function syncCampaignPayload(input: CampaignSyncPayload): Promise<CampaignSyncResult> {
  const campaigns = input.campaigns ?? [];
  const leads = input.leads ?? [];
  const events = input.events ?? [];

  if (campaigns.length > 0) {
    requireExternalIdentity(campaigns, 'campaigns');
    const { error } = await supabaseAdmin
      .from('campaigns')
      .upsert(campaigns.map((row) => withoutUndefined(row as Record<string, unknown>)), {
        onConflict: 'source,external_id',
      });
    if (error) throw new Error(`sync campaigns: ${error.message}`);
  }

  if (leads.length > 0) {
    requireLeadExternalIdentity(leads);
    const { error } = await supabaseAdmin
      .from('campaign_leads')
      .upsert(leads.map((row) => withoutUndefined(row as Record<string, unknown>)), {
        onConflict: 'campaign_id,external_system,external_id',
      });
    if (error) throw new Error(`sync campaign_leads: ${error.message}`);
  }

  if (events.length > 0) {
    requireExternalIdentity(events, 'campaign_events');
    const { error } = await supabaseAdmin
      .from('campaign_events')
      .upsert(events.map((row) => withoutUndefined(row as Record<string, unknown>)), {
        onConflict: 'source,external_id',
      });
    if (error) throw new Error(`sync campaign_events: ${error.message}`);
  }

  return { campaigns: campaigns.length, leads: leads.length, events: events.length };
}

export function calculateCampaignStats(
  leads: Array<Pick<CampaignLeadRow, 'stage'>>,
  events: Array<Pick<CampaignEventRow, 'event_type'>>,
): CampaignStats {
  const sent = events.filter((event) => event.event_type === 'sent').length;
  const replies = events.filter((event) => event.event_type === 'replied').length;
  const opens = events.filter((event) => event.event_type === 'opened').length;
  const followupsDue = leads.filter((lead) => lead.stage === 'followup_due').length;
  const blocked = leads.filter((lead) => lead.stage === 'blocked').length;

  return {
    sent,
    replies,
    replyRate: sent > 0 ? Math.round((replies / sent) * 100) : null,
    opens,
    openRate: sent > 0 && opens > 0 ? Math.round((opens / sent) * 100) : null,
    followupsDue,
    blocked,
  };
}

export async function listCampaignSummaries(): Promise<CampaignSummary[]> {
  const [campaigns, leads, events] = await Promise.all([
    readTable<CampaignRow>('campaigns', 'id, name, type, status, owner_member_id, source, external_id, created_at, updated_at'),
    readTable<CampaignLeadRow>('campaign_leads', '*'),
    readTable<CampaignEventRow>('campaign_events', '*'),
  ]);

  return campaigns.map((campaign) => {
    const campaignLeads = leads.filter((lead) => lead.campaign_id === campaign.id);
    const campaignEvents = events.filter((event) => event.campaign_id === campaign.id);
    return {
      ...campaign,
      leadCount: campaignLeads.length,
      stats: calculateCampaignStats(campaignLeads, campaignEvents),
    };
  });
}

export async function getCampaignDetail(id: string): Promise<CampaignDetail | null> {
  const [campaigns, leads, events] = await Promise.all([
    readTable<CampaignRow>('campaigns', 'id, name, type, status, owner_member_id, source, external_id, created_at, updated_at'),
    readTable<CampaignLeadRow>('campaign_leads', '*'),
    readTable<CampaignEventRow>('campaign_events', '*'),
  ]);
  const campaign = campaigns.find((row) => row.id === id);
  if (!campaign) return null;
  const campaignLeads = leads.filter((lead) => lead.campaign_id === id);
  const campaignEvents = events.filter((event) => event.campaign_id === id);
  return {
    ...campaign,
    leadCount: campaignLeads.length,
    stats: calculateCampaignStats(campaignLeads, campaignEvents),
    leads: campaignLeads.map((lead) => ({
      ...lead,
      events: campaignEvents
        .filter((event) => event.lead_id === lead.id)
        .sort((a, b) => String(b.occurred_at ?? '').localeCompare(String(a.occurred_at ?? ''))),
    })),
  };
}

export async function routeCampaignActions(now = new Date()): Promise<{
  created: number;
  skipped: number;
  actions: CampaignRouteAction[];
}> {
  const [campaigns, leads, logs, members] = await Promise.all([
    readTable<CampaignRow>('campaigns', 'id, name, type, status, owner_member_id'),
    readTable<CampaignLeadRow>('campaign_leads', '*'),
    readTable<{ idempotency_key: string }>('campaign_action_log', 'idempotency_key'),
    readTable<TeamMemberLite>('team_members', 'id, linear_user_id, hubspot_owner_id'),
  ]);

  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  const memberById = new Map(members.map((member) => [member.id, member]));
  const existing = new Set(logs.map((log) => log.idempotency_key));
  const actions: CampaignRouteAction[] = [];

  for (const lead of leads) {
    if (!shouldRouteLead(lead, now)) continue;
    const campaign = campaignById.get(lead.campaign_id);
    if (!campaign || campaign.status !== 'active') continue;

    const actionType = campaign.type === 'handwerker' ? 'hubspot_task' : 'linear_task';
    const idempotencyKey = buildIdempotencyKey(campaign.id, lead, actionType, now);
    if (existing.has(idempotencyKey)) {
      actions.push({
        campaignId: campaign.id,
        leadId: lead.id,
        actionType,
        idempotencyKey,
        externalId: null,
        status: 'skipped',
        reason: 'already-routed',
      });
      continue;
    }

    const ownerId = lead.owner_member_id ?? campaign.owner_member_id;
    const member = ownerId ? memberById.get(ownerId) : null;
    if (!member) {
      actions.push(skipped(campaign.id, lead.id, actionType, idempotencyKey, 'missing-owner'));
      continue;
    }

    const title = taskTitle(campaign, lead);
    const description = taskDescription(campaign, lead);
    let externalId: string | null = null;

    if (actionType === 'hubspot_task') {
      if (!member.hubspot_owner_id) {
        actions.push(skipped(campaign.id, lead.id, actionType, idempotencyKey, 'missing-hubspot-owner'));
        continue;
      }
      const task = await createHubSpotTask({
        ownerId: member.hubspot_owner_id,
        subject: title,
        body: description,
        dueAt: lead.next_action_at ?? now.toISOString(),
      });
      externalId = task.id;
    } else {
      if (!member.linear_user_id) {
        actions.push(skipped(campaign.id, lead.id, actionType, idempotencyKey, 'missing-linear-owner'));
        continue;
      }
      const issue = await createLinearFollowupTask({
        assigneeId: member.linear_user_id,
        title,
        description,
        dueDate: lead.next_action_at?.slice(0, 10) ?? null,
      });
      externalId = issue.id;
    }

    await supabaseAdmin.from('campaign_action_log').insert({
      campaign_id: campaign.id,
      lead_id: lead.id,
      action_type: actionType,
      idempotency_key: idempotencyKey,
      external_id: externalId,
      status: 'created',
    });
    existing.add(idempotencyKey);
    actions.push({
      campaignId: campaign.id,
      leadId: lead.id,
      actionType,
      idempotencyKey,
      externalId,
      status: 'created',
    });
  }

  return {
    created: actions.filter((action) => action.status === 'created').length,
    skipped: actions.filter((action) => action.status === 'skipped').length,
    actions,
  };
}

async function readTable<T>(table: string, columns: string): Promise<T[]> {
  const { data, error } = await supabaseAdmin.from(table).select(columns).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as T[];
}

function shouldRouteLead(lead: CampaignLeadRow, now: Date): boolean {
  if (lead.stage !== 'followup_due' && lead.stage !== 'replied') return false;
  if (!lead.next_action_at) return true;
  const due = Date.parse(lead.next_action_at);
  return Number.isNaN(due) || due <= now.getTime();
}

function buildIdempotencyKey(
  campaignId: string,
  lead: Pick<CampaignLeadRow, 'id' | 'stage' | 'next_action_at'>,
  actionType: CampaignRouteAction['actionType'],
  now: Date,
): string {
  const day = lead.next_action_at?.slice(0, 10) || now.toISOString().slice(0, 10);
  return `${campaignId}:${lead.id}:${lead.stage}:${day}:${actionType}`;
}

function taskTitle(campaign: CampaignRow, lead: CampaignLeadRow): string {
  const name = lead.display_name || lead.company_name || lead.email || lead.id;
  const prefix = lead.stage === 'replied' ? 'Reply bearbeiten' : 'Follow-up faellig';
  return `${prefix}: ${name}`;
}

function taskDescription(campaign: CampaignRow, lead: CampaignLeadRow): string {
  return [
    `Campaign: ${campaign.name}`,
    `Typ: ${campaign.type}`,
    `Lead: ${lead.display_name || lead.company_name || lead.email || lead.id}`,
    lead.next_action ? `Naechste Aktion: ${lead.next_action}` : null,
    lead.next_action_at ? `Faellig: ${lead.next_action_at}` : null,
    'Hinweis: Team-OS erstellt nur Aufgaben, keine Mails.',
  ].filter(Boolean).join('\n');
}

function skipped(
  campaignId: string,
  leadId: string,
  actionType: CampaignRouteAction['actionType'],
  idempotencyKey: string,
  reason: string,
): CampaignRouteAction {
  return {
    campaignId,
    leadId,
    actionType,
    idempotencyKey,
    externalId: null,
    status: 'skipped',
    reason,
  };
}

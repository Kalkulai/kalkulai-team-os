import { supabaseAdmin } from '@/lib/supabase';
import type { SalesCompany, SalesCompanyDetail, SalesCompanyListItem, SalesContact, SalesStage, RelationshipHealth } from '@/types/sales';

function computeRelationshipHealth(daysSince: number | null, hasInbound: boolean): RelationshipHealth {
  if (daysSince === null) return 'red';
  if (daysSince <= 14) return hasInbound ? 'green' : 'green';
  if (daysSince <= 30) return 'yellow';
  return 'red';
}

export async function listCompaniesForMember(memberId: string): Promise<SalesCompanyListItem[]> {
  const { data, error } = await supabaseAdmin
    .from('sales_companies')
    .select('*')
    .eq('owner_member_id', memberId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`sales_companies list failed: ${error.message}`);
  const companies = (data ?? []) as SalesCompany[];
  if (companies.length === 0) return [];

  const [contactsRes, activitiesRes, phonesRes, inboundRes] = await Promise.all([
    supabaseAdmin
      .from('sales_contacts')
      .select('company_id, sales_companies!inner(owner_member_id)')
      .eq('sales_companies.owner_member_id', memberId),
    supabaseAdmin
      .from('sales_activities')
      .select('company_id, occurred_at, activity_type, sales_companies!inner(owner_member_id)')
      .eq('sales_companies.owner_member_id', memberId)
      .neq('activity_type', 'sync')
      .order('occurred_at', { ascending: false }),
    supabaseAdmin
      .from('sales_endpoints')
      .select('company_id, value, channel, sales_companies!inner(owner_member_id)')
      .eq('sales_companies.owner_member_id', memberId)
      .in('channel', ['phone', 'mobile'])
      .eq('do_not_call', false)
      .order('priority', { ascending: false }),
    supabaseAdmin
      .from('sales_activities')
      .select('company_id, sales_companies!inner(owner_member_id)')
      .eq('sales_companies.owner_member_id', memberId)
      .eq('direction', 'inbound'),
  ]);
  if (contactsRes.error) throw new Error(`sales_contacts count failed: ${contactsRes.error.message}`);
  if (activitiesRes.error) throw new Error(`sales_activities list failed: ${activitiesRes.error.message}`);
  if (phonesRes.error) throw new Error(`sales_endpoints phone query failed: ${phonesRes.error.message}`);
  if (inboundRes.error) throw new Error(`sales_activities inbound query failed: ${inboundRes.error.message}`);

  const contactCount = new Map<string, number>();
  for (const row of contactsRes.data ?? []) {
    contactCount.set(row.company_id, (contactCount.get(row.company_id) ?? 0) + 1);
  }
  const transcriptCount = new Map<string, number>();
  const lastActivity = new Map<string, { occurred_at: string; activity_type: string }>();
  for (const row of activitiesRes.data ?? []) {
    if (row.activity_type === 'transcript') {
      transcriptCount.set(row.company_id, (transcriptCount.get(row.company_id) ?? 0) + 1);
    }
    if (!lastActivity.has(row.company_id)) {
      lastActivity.set(row.company_id, { occurred_at: row.occurred_at, activity_type: row.activity_type });
    }
  }
  const firstPhone = new Map<string, { value: string; channel: string }>();
  for (const ep of phonesRes.data ?? []) {
    if (!firstPhone.has(ep.company_id)) {
      firstPhone.set(ep.company_id, { value: ep.value, channel: ep.channel });
    }
  }
  const hasInbound = new Set<string>();
  for (const row of inboundRes.data ?? []) {
    hasInbound.add(row.company_id);
  }

  const now = Date.now();
  return companies.map((raw) => {
    // Defensive: migration 037 adds stage/cold_streak/ai_summary — may not exist yet in DB
    const c = raw as SalesCompany & Record<string, unknown>;
    const stage: SalesStage = (typeof c.stage === 'string' ? c.stage : 'prospecting') as SalesStage;
    const coldStreak: number = typeof c.cold_streak === 'number' ? c.cold_streak : 0;
    const aiSummary: string | null = typeof c.ai_summary === 'string' ? c.ai_summary : null;
    const stageEnteredAt: string | null = typeof c.stage_entered_at === 'string' ? c.stage_entered_at : null;

    const lastAt = lastActivity.get(c.id)?.occurred_at ?? null;
    const daysSince = lastAt ? Math.floor((now - new Date(lastAt).getTime()) / 86400000) : null;
    const txCount = transcriptCount.get(c.id) ?? 0;

    let priority = 0;
    if (c.next_step) priority += 3;
    if (txCount > 0) priority += 2;
    if (daysSince === null) priority -= 1;
    else if (daysSince >= 14) priority += 2;
    else if (daysSince >= 7) priority += 1;
    else if (daysSince < 2) priority -= 1;
    if (stage === 'evaluation' || stage === 'pilot') priority += 2;
    if (stage === 'discovery') priority += 1;

    return {
      ...c,
      stage,
      cold_streak: coldStreak,
      ai_summary: aiSummary,
      stage_entered_at: stageEnteredAt,
      contact_count: contactCount.get(c.id) ?? 0,
      last_activity_at: lastAt,
      last_activity_type: lastActivity.get(c.id)?.activity_type ?? null,
      days_since_contact: daysSince,
      priority_score: priority,
      transcript_count: txCount,
      first_phone: firstPhone.get(c.id)?.value ?? null,
      first_phone_channel: firstPhone.get(c.id)?.channel ?? null,
      relationship_health: computeRelationshipHealth(daysSince, hasInbound.has(c.id)),
    };
  }).sort((a, b) => b.priority_score - a.priority_score || a.name.localeCompare(b.name, 'de'));
}

export async function getCompanyDetail(companyId: string, memberId: string): Promise<SalesCompanyDetail | null> {
  const { data: company, error } = await supabaseAdmin
    .from('sales_companies')
    .select('*')
    .eq('id', companyId)
    .eq('owner_member_id', memberId)
    .maybeSingle();
  if (error) throw new Error(`sales_companies get failed: ${error.message}`);
  if (!company) return null;

  const [contacts, endpoints, activities] = await Promise.all([
    supabaseAdmin.from('sales_contacts').select('*').eq('company_id', companyId).order('last_name'),
    supabaseAdmin.from('sales_endpoints').select('*').eq('company_id', companyId).order('priority', { ascending: false }),
    supabaseAdmin.from('sales_activities').select('*').eq('company_id', companyId)
      .order('occurred_at', { ascending: false }).limit(200),
  ]);
  for (const res of [contacts, endpoints, activities]) {
    if (res.error) throw new Error(`sales detail failed: ${res.error.message}`);
  }
  const raw = company as SalesCompany & Record<string, unknown>;
  return {
    ...raw,
    stage: (typeof raw.stage === 'string' ? raw.stage : 'prospecting') as SalesStage,
    cold_streak: typeof raw.cold_streak === 'number' ? raw.cold_streak : 0,
    ai_summary: typeof raw.ai_summary === 'string' ? raw.ai_summary : null,
    stage_entered_at: typeof raw.stage_entered_at === 'string' ? raw.stage_entered_at : null,
    contacts: contacts.data ?? [],
    endpoints: endpoints.data ?? [],
    activities: activities.data ?? [],
  } as SalesCompanyDetail;
}

export async function updateCompanyStage(
  companyId: string,
  memberId: string,
  stage: SalesStage,
): Promise<void> {
  const update: Record<string, unknown> = {
    stage,
    stage_entered_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  // Keep pilot_status in sync for insights-extraction backward compat
  if (stage === 'pilot') update.pilot_status = 'active';
  else if (stage === 'customer' || stage === 'disqualified') update.pilot_status = null;

  const { error } = await supabaseAdmin
    .from('sales_companies')
    .update(update)
    .eq('id', companyId)
    .eq('owner_member_id', memberId);
  if (error) throw new Error(`sales stage update failed: ${error.message}`);
}

export async function updateAiSummary(companyId: string, summary: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('sales_companies')
    .update({ ai_summary: summary, updated_at: new Date().toISOString() })
    .eq('id', companyId);
  if (error) throw new Error(`ai_summary update failed: ${error.message}`);
}

export async function updateColdStreak(
  companyId: string,
  action: 'increment' | 'reset',
): Promise<void> {
  if (action === 'reset') {
    await supabaseAdmin
      .from('sales_companies')
      .update({ cold_streak: 0, updated_at: new Date().toISOString() })
      .eq('id', companyId);
    return;
  }
  // increment via raw RPC to avoid race condition
  const { error } = await supabaseAdmin.rpc('increment_cold_streak', { company_id_input: companyId });
  if (error) {
    // Fallback: fetch and update
    const { data } = await supabaseAdmin
      .from('sales_companies')
      .select('cold_streak')
      .eq('id', companyId)
      .single();
    const current = (data?.cold_streak as number) ?? 0;
    await supabaseAdmin
      .from('sales_companies')
      .update({ cold_streak: current + 1, updated_at: new Date().toISOString() })
      .eq('id', companyId);
  }
}

export async function createCompany(input: {
  name: string;
  website?: string | null;
  phone?: string | null;
  ownerMemberId: string;
}): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('sales_companies')
    .insert({
      owner_member_id: input.ownerMemberId,
      name: input.name.trim(),
      website: input.website?.trim() || null,
      stage: 'prospecting',
    })
    .select('id')
    .single();
  if (error) throw new Error(`sales_companies insert failed: ${error.message}`);
  const companyId = data.id as string;
  if (input.phone?.trim()) {
    await supabaseAdmin.from('sales_endpoints').insert({
      company_id: companyId,
      contact_id: null,
      channel: 'phone',
      value: input.phone.trim(),
      endpoint_type: 'direct',
      source: 'manual',
    });
  }
  return companyId;
}

export async function upsertCompanyFromHubspot(row: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('sales_companies')
    .upsert(row, { onConflict: 'hubspot_company_id' })
    .select('id')
    .single();
  if (error) throw new Error(`sales_companies upsert failed: ${error.message}`);
  return data.id as string;
}

export async function upsertContactFromHubspot(companyId: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('sales_contacts')
    .upsert({ ...row, company_id: companyId }, { onConflict: 'hubspot_contact_id' })
    .select('id')
    .single();
  if (error) throw new Error(`sales_contacts upsert failed: ${error.message}`);
  return data.id as string;
}

export async function createContact(companyId: string, input: Partial<SalesContact>): Promise<SalesContact> {
  const { data, error } = await supabaseAdmin
    .from('sales_contacts')
    .insert({
      company_id: companyId,
      first_name: input.first_name ?? '',
      last_name: input.last_name ?? '',
      role: input.role ?? null,
      email: input.email ?? null,
      recording_consent: input.recording_consent ?? true,
    })
    .select('*')
    .single();
  if (error) throw new Error(`sales_contacts insert failed: ${error.message}`);
  return data as SalesContact;
}

export async function updateContact(contactId: string, patch: Partial<SalesContact>): Promise<void> {
  const allowed = ['first_name', 'last_name', 'role', 'email', 'recording_consent'] as const;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (patch[key] !== undefined) update[key] = patch[key];
  }
  const { error } = await supabaseAdmin.from('sales_contacts').update(update).eq('id', contactId);
  if (error) throw new Error(`sales_contacts update failed: ${error.message}`);
}

export async function updateCompanyNextStep(companyId: string, memberId: string, nextStep: string | null): Promise<void> {
  const { error } = await supabaseAdmin
    .from('sales_companies')
    .update({ next_step: nextStep, updated_at: new Date().toISOString() })
    .eq('id', companyId)
    .eq('owner_member_id', memberId);
  if (error) throw new Error(`sales_companies next_step failed: ${error.message}`);
}

export async function updateCompanyPilotStatus(
  companyId: string,
  memberId: string,
  pilotStatus: 'active' | 'committed' | null,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('sales_companies')
    .update({ pilot_status: pilotStatus, updated_at: new Date().toISOString() })
    .eq('id', companyId)
    .eq('owner_member_id', memberId);
  if (error) throw new Error(`pilot_status update failed: ${error.message}`);
}

export async function upsertEndpoint(companyId: string, contactId: string | null, draft: {
  channel: string; value: string; endpoint_type: string;
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from('sales_endpoints')
    .upsert({ company_id: companyId, contact_id: contactId, source: 'hubspot', ...draft },
            { onConflict: 'company_id,channel,value' });
  if (error) throw new Error(`sales_endpoints upsert failed: ${error.message}`);
}

export async function upsertActivity(companyId: string, contactId: string | null, row: Record<string, unknown>): Promise<void> {
  const { error } = await supabaseAdmin
    .from('sales_activities')
    .upsert({ ...row, company_id: companyId, contact_id: contactId },
            { onConflict: 'provider_event_id' });
  if (error) throw new Error(`sales_activities upsert failed: ${error.message}`);
}

export async function logSyncActivity(companyId: string, hubspotCompanyId: string): Promise<void> {
  await upsertActivity(companyId, null, {
    activity_type: 'sync', direction: 'internal', source_system: 'hubspot',
    provider_event_id: `hubspot-sync-${hubspotCompanyId}`,
    title: 'Aus HubSpot importiert',
  });
}

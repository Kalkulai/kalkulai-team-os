import { supabaseAdmin } from '@/lib/supabase';
import type { SalesCompany, SalesCompanyDetail, SalesCompanyListItem, SalesContact } from '@/types/sales';

export async function listCompaniesForMember(memberId: string): Promise<SalesCompanyListItem[]> {
  const { data, error } = await supabaseAdmin
    .from('sales_companies')
    .select('*')
    .eq('owner_member_id', memberId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`sales_companies list failed: ${error.message}`);
  const companies = (data ?? []) as SalesCompany[];
  if (companies.length === 0) return [];

  const ids = companies.map((c) => c.id);
  const [contactsRes, activitiesRes] = await Promise.all([
    supabaseAdmin.from('sales_contacts').select('company_id').in('company_id', ids),
    supabaseAdmin.from('sales_activities').select('company_id, occurred_at, activity_type')
      .in('company_id', ids).neq('activity_type', 'sync')
      .order('occurred_at', { ascending: false }),
  ]);
  if (contactsRes.error) throw new Error(`sales_contacts count failed: ${contactsRes.error.message}`);
  if (activitiesRes.error) throw new Error(`sales_activities list failed: ${activitiesRes.error.message}`);

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

  const now = Date.now();
  return companies.map((c) => {
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

    return {
      ...c,
      contact_count: contactCount.get(c.id) ?? 0,
      last_activity_at: lastAt,
      last_activity_type: lastActivity.get(c.id)?.activity_type ?? null,
      days_since_contact: daysSince,
      priority_score: priority,
      transcript_count: txCount,
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
  return {
    ...(company as SalesCompany),
    contacts: contacts.data ?? [],
    endpoints: endpoints.data ?? [],
    activities: activities.data ?? [],
  } as SalesCompanyDetail;
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

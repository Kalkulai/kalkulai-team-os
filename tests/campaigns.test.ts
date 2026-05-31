import { beforeEach, describe, expect, it, vi } from 'vitest';

const rows: Record<string, unknown[]> = {};
const fromCalls: string[] = [];
const insertPayloads: Record<string, unknown>[] = [];
const upsertPayloads: Array<{ table: string; payload: unknown; options: unknown }> = [];

function responseFor(table: string) {
  return Promise.resolve({ data: rows[table] ?? [], error: null });
}

function makeBuilder(table: string): unknown {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const method of ['select', 'eq', 'lte', 'order', 'in']) builder[method] = vi.fn(chain);
  builder.insert = vi.fn((payload: Record<string, unknown>) => {
    insertPayloads.push(payload);
    return Promise.resolve({ data: [payload], error: null });
  });
  builder.upsert = vi.fn((payload: unknown, options: unknown) => {
    upsertPayloads.push({ table, payload, options });
    return Promise.resolve({ data: payload, error: null });
  });
  builder.single = vi.fn(() => Promise.resolve({ data: (rows[table] ?? [])[0] ?? null, error: null }));
  builder.then = (onFulfilled: (value: unknown) => unknown, onRejected?: (error: unknown) => unknown) =>
    responseFor(table).then(onFulfilled, onRejected);
  return builder;
}

const fromMock = vi.fn((table: string) => {
  fromCalls.push(table);
  return makeBuilder(table);
});

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...(args as [string])) },
}));

const createHubSpotTaskMock = vi.fn();
const createLinearFollowupTaskMock = vi.fn();

vi.mock('@/lib/hubspot', () => ({
  createHubSpotTask: (...args: unknown[]) => createHubSpotTaskMock(...args),
}));

vi.mock('@/lib/campaign-task-routing', () => ({
  createLinearFollowupTask: (...args: unknown[]) => createLinearFollowupTaskMock(...args),
}));

import {
  calculateCampaignStats,
  listCampaignSummaries,
  routeCampaignActions,
  syncCampaignPayload,
} from '@/lib/campaigns';
import { campaignViewEnabledForMember } from '@/lib/campaign-access';

const LEON = 'bd695d11-0632-4a0a-b1d0-db43acf46a68';
const PAUL = '24d43f6d-4a7e-458b-a119-84ecb8e6616f';

beforeEach(() => {
  for (const key of Object.keys(rows)) delete rows[key];
  fromCalls.length = 0;
  insertPayloads.length = 0;
  upsertPayloads.length = 0;
  fromMock.mockClear();
  createHubSpotTaskMock.mockReset();
  createLinearFollowupTaskMock.mockReset();
  createHubSpotTaskMock.mockResolvedValue({ id: 'hs-task-1' });
  createLinearFollowupTaskMock.mockResolvedValue({ id: 'lin-task-1' });
});

describe('campaign access', () => {
  it('enables the campaign view only for Leon', () => {
    expect(campaignViewEnabledForMember(LEON)).toBe(true);
    expect(campaignViewEnabledForMember(PAUL)).toBe(false);
    expect(campaignViewEnabledForMember(null)).toBe(false);
  });
});

describe('campaign aggregation', () => {
  it('computes sent/reply/follow-up metrics without inventing open-rate', () => {
    const stats = calculateCampaignStats(
      [
        { id: 'lead-1', stage: 'followup_due' },
        { id: 'lead-2', stage: 'blocked' },
        { id: 'lead-3', stage: 'sent' },
      ],
      [
        { event_type: 'sent' },
        { event_type: 'sent' },
        { event_type: 'replied' },
      ],
    );

    expect(stats.sent).toBe(2);
    expect(stats.replies).toBe(1);
    expect(stats.replyRate).toBe(50);
    expect(stats.openRate).toBeNull();
    expect(stats.followupsDue).toBe(1);
    expect(stats.blocked).toBe(1);
  });

  it('lists campaign summaries with aggregated stats', async () => {
    rows.campaigns = [
      { id: 'camp-1', name: 'Partnerships Bayern', type: 'partnerships', status: 'active', owner_member_id: LEON },
    ];
    rows.campaign_leads = [
      { id: 'lead-1', campaign_id: 'camp-1', stage: 'sent' },
      { id: 'lead-2', campaign_id: 'camp-1', stage: 'followup_due' },
    ];
    rows.campaign_events = [
      { campaign_id: 'camp-1', lead_id: 'lead-1', event_type: 'sent' },
      { campaign_id: 'camp-1', lead_id: 'lead-1', event_type: 'replied' },
    ];

    const out = await listCampaignSummaries();

    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Partnerships Bayern');
    expect(out[0].stats.replyRate).toBe(100);
    expect(out[0].stats.followupsDue).toBe(1);
  });
});

describe('campaign sync', () => {
  it('upserts normalized Operations payloads idempotently by external identity', async () => {
    const result = await syncCampaignPayload({
      campaigns: [{
        name: 'Partner Juni',
        type: 'partnerships',
        status: 'active',
        source: 'operations',
        external_id: 'ops-camp-1',
      }],
      leads: [{
        campaign_id: '00000000-0000-0000-0000-000000000001',
        display_name: 'Malerverband Bayern',
        stage: 'ready',
        external_system: 'operations',
        external_id: 'ops-lead-1',
      }],
      events: [{
        campaign_id: '00000000-0000-0000-0000-000000000001',
        event_type: 'sent',
        source: 'hubspot',
        external_id: 'email-1',
      }],
    });

    expect(result).toEqual({ campaigns: 1, leads: 1, events: 1 });
    expect(upsertPayloads.map((call) => call.table)).toEqual([
      'campaigns',
      'campaign_leads',
      'campaign_events',
    ]);
    expect(upsertPayloads[0].options).toEqual({ onConflict: 'source,external_id' });
    expect(upsertPayloads[1].options).toEqual({ onConflict: 'campaign_id,external_system,external_id' });
    expect(upsertPayloads[2].options).toEqual({ onConflict: 'source,external_id' });
  });
});

describe('campaign task routing', () => {
  it('routes handwerker follow-ups into one HubSpot task for Paul', async () => {
    rows.campaigns = [
      { id: 'camp-h', name: 'Handwerker Juni', type: 'handwerker', status: 'active', owner_member_id: PAUL },
    ];
    rows.campaign_leads = [
      {
        id: 'lead-h',
        campaign_id: 'camp-h',
        display_name: 'Maler Mustermann',
        stage: 'followup_due',
        owner_member_id: PAUL,
        next_action_at: '2026-05-31T09:00:00.000Z',
      },
    ];
    rows.campaign_action_log = [];
    rows.team_members = [{ id: PAUL, hubspot_owner_id: 'paul-owner', linear_user_id: 'paul-linear' }];

    const result = await routeCampaignActions(new Date('2026-05-31T12:00:00.000Z'));

    expect(result.created).toBe(1);
    expect(createHubSpotTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: 'paul-owner',
      subject: expect.stringContaining('Maler Mustermann'),
    }));
    expect(createLinearFollowupTaskMock).not.toHaveBeenCalled();
    expect(insertPayloads[0]).toMatchObject({
      campaign_id: 'camp-h',
      lead_id: 'lead-h',
      action_type: 'hubspot_task',
      external_id: 'hs-task-1',
    });
  });

  it('routes partnership replies into one Leon task and skips existing action logs', async () => {
    rows.campaigns = [
      { id: 'camp-p', name: 'Partner Juni', type: 'partnerships', status: 'active', owner_member_id: LEON },
    ];
    rows.campaign_leads = [
      {
        id: 'lead-p',
        campaign_id: 'camp-p',
        display_name: 'Malerverband Bayern',
        stage: 'replied',
        owner_member_id: LEON,
        next_action_at: '2026-05-31T09:00:00.000Z',
      },
    ];
    rows.campaign_action_log = [
      { idempotency_key: 'camp-p:lead-p:replied:2026-05-31:linear_task' },
    ];
    rows.team_members = [{ id: LEON, hubspot_owner_id: null, linear_user_id: 'leon-linear' }];

    const result = await routeCampaignActions(new Date('2026-05-31T12:00:00.000Z'));

    expect(result.created).toBe(0);
    expect(createLinearFollowupTaskMock).not.toHaveBeenCalled();
    expect(createHubSpotTaskMock).not.toHaveBeenCalled();
  });
});

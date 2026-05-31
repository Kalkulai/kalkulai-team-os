import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const SECRET = 'unit-test-secret';

const listCampaignSummariesMock = vi.fn();
const getCampaignDetailMock = vi.fn();
const routeCampaignActionsMock = vi.fn();
const syncCampaignPayloadMock = vi.fn();

vi.mock('@/lib/campaigns', () => ({
  listCampaignSummaries: (...args: unknown[]) => listCampaignSummariesMock(...args),
  getCampaignDetail: (...args: unknown[]) => getCampaignDetailMock(...args),
  routeCampaignActions: (...args: unknown[]) => routeCampaignActionsMock(...args),
  syncCampaignPayload: (...args: unknown[]) => syncCampaignPayloadMock(...args),
}));

vi.mock('@/lib/revalidate', () => ({
  revalidateDashboard: vi.fn(),
}));

import { GET as listCampaigns } from '@/app/api/campaigns/route';
import { GET as getCampaign } from '@/app/api/campaigns/[id]/route';
import { POST as routeActions } from '@/app/api/campaigns/route-actions/route';
import { POST as syncCampaigns } from '@/app/api/campaigns/sync/route';

function request(url: string, init: ConstructorParameters<typeof NextRequest>[1] = {}): NextRequest {
  return new NextRequest(url, init);
}

function authHeaders(): Headers {
  return new Headers({
    authorization: `Bearer ${SECRET}`,
    'content-type': 'application/json',
  });
}

describe('campaign API routes', () => {
  beforeEach(() => {
    process.env.DASHBOARD_API_SECRET = SECRET;
    listCampaignSummariesMock.mockReset();
    getCampaignDetailMock.mockReset();
    routeCampaignActionsMock.mockReset();
    syncCampaignPayloadMock.mockReset();
    listCampaignSummariesMock.mockResolvedValue([]);
    getCampaignDetailMock.mockResolvedValue(null);
    routeCampaignActionsMock.mockResolvedValue({ created: 0, skipped: 0, actions: [] });
    syncCampaignPayloadMock.mockResolvedValue({ campaigns: 0, leads: 0, events: 0 });
  });

  it('requires Bearer auth for campaign list reads', async () => {
    const res = await listCampaigns(request('http://localhost/api/campaigns'));

    expect(res.status).toBe(401);
    expect(listCampaignSummariesMock).not.toHaveBeenCalled();
  });

  it('returns campaign summaries for authenticated reads', async () => {
    listCampaignSummariesMock.mockResolvedValueOnce([{ id: 'camp-1', name: 'Kampagne' }]);

    const res = await listCampaigns(request('http://localhost/api/campaigns', { headers: authHeaders() }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.campaigns).toEqual([{ id: 'camp-1', name: 'Kampagne' }]);
  });

  it('returns 404 for a missing campaign detail', async () => {
    const res = await getCampaign(
      request('http://localhost/api/campaigns/missing', { headers: authHeaders() }),
      { params: Promise.resolve({ id: 'missing' }) },
    );

    expect(res.status).toBe(404);
  });

  it('routes due actions behind auth', async () => {
    routeCampaignActionsMock.mockResolvedValueOnce({ created: 2, skipped: 1, actions: [] });

    const res = await routeActions(request('http://localhost/api/campaigns/route-actions', {
      method: 'POST',
      headers: authHeaders(),
    }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.created).toBe(2);
    expect(routeCampaignActionsMock).toHaveBeenCalledOnce();
  });

  it('syncs campaign imports behind auth without sending mails', async () => {
    syncCampaignPayloadMock.mockResolvedValueOnce({ campaigns: 1, leads: 2, events: 3 });

    const res = await syncCampaigns(request('http://localhost/api/campaigns/sync', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ campaigns: [{ source: 'operations', external_id: 'camp-1' }] }),
    }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.imported).toEqual({ campaigns: 1, leads: 2, events: 3 });
    expect(json.note).toContain('No mails');
    expect(syncCampaignPayloadMock).toHaveBeenCalledWith({
      campaigns: [{ source: 'operations', external_id: 'camp-1' }],
    });
  });
});

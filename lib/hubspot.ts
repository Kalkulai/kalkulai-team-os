import type { HubSpotCall } from '@/types';

async function hsFetch<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN!}` },
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`HubSpot ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export async function getCallsThisWeek(hubspotOwnerId: string): Promise<HubSpotCall[]> {
  const monday = new Date();
  monday.setDate(monday.getDate() - monday.getDay() + 1);
  monday.setHours(0, 0, 0, 0);

  const data = await hsFetch<{
    results: Array<{
      id: string;
      properties: { hs_timestamp: string; hs_call_duration: string; hubspot_owner_id: string };
    }>;
  }>('/crm/v3/objects/calls?limit=100&properties=hs_timestamp,hs_call_duration,hubspot_owner_id');

  return (data.results ?? [])
    .filter((c) =>
      new Date(c.properties.hs_timestamp) >= monday &&
      c.properties.hubspot_owner_id === hubspotOwnerId
    )
    .map((c) => ({
      id: c.id,
      timestamp: c.properties.hs_timestamp,
      duration: parseInt(c.properties.hs_call_duration ?? '0', 10),
      ownerId: c.properties.hubspot_owner_id,
    }));
}

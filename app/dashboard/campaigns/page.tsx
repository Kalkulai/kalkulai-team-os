import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ViewToggle } from '@/components/dashboard/ViewToggle';
import { CampaignDashboard } from '@/components/campaigns/CampaignDashboard';
import { getAllMembers } from '@/lib/supabase';
import { campaignViewEnabledForMember } from '@/lib/campaign-access';
import { getCampaignDetail, listCampaignSummaries } from '@/lib/campaigns';

const ACTIVE_MEMBER_COOKIE = 'kalkulai-active-member';

export const dynamic = 'force-dynamic';

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string }>;
}) {
  const [members, params, cookieStore] = await Promise.all([
    getAllMembers(),
    searchParams,
    cookies(),
  ]);

  if (!members.length) {
    return <p className="text-[13px] text-[var(--ink-3)]">Keine Teammitglieder konfiguriert.</p>;
  }

  const fromCookie = cookieStore.get(ACTIVE_MEMBER_COOKIE)?.value;
  const me =
    members.find((m) => m.id === params.member) ??
    members.find((m) => m.id === fromCookie) ??
    members[0];

  if (!campaignViewEnabledForMember(me.id)) {
    redirect(`/dashboard?member=${me.id}`);
  }

  const campaigns = await listCampaignSummaries();
  const details = await Promise.all(campaigns.map((campaign) => getCampaignDetail(campaign.id)));

  return (
    <>
      <ViewToggle currentView="campaigns" memberId={me.id} />
      <CampaignDashboard
        campaigns={campaigns}
        details={details.filter((detail): detail is NonNullable<typeof detail> => Boolean(detail))}
      />
    </>
  );
}

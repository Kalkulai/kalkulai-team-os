import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAllMembers } from '@/lib/supabase';
import { salesOsEnabledForMember } from '@/lib/sales-access';
import { listCompaniesForMember, getCompanyDetail } from '@/lib/sales-os';
import { SalesDashboard } from '@/components/sales/SalesDashboard';

const ACTIVE_MEMBER_COOKIE = 'kalkulai-active-member';

export const dynamic = 'force-dynamic';

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string; company?: string }>;
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

  if (!salesOsEnabledForMember(me.id)) {
    redirect(`/dashboard?member=${me.id}`);
  }

  const companies = await listCompaniesForMember(me.id);
  const selected = params.company ? await getCompanyDetail(params.company, me.id) : null;

  return <SalesDashboard memberId={me.id} companies={companies} selected={selected} />;
}

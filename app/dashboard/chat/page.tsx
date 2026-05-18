import { cookies } from 'next/headers';
import { getAllMembers } from '@/lib/supabase';
import { ViewToggle } from '@/components/dashboard/ViewToggle';
import { HermesChatShell } from '@/components/hermes/HermesChatShell';

const ACTIVE_MEMBER_COOKIE = 'kalkulai-active-member';

export const dynamic = 'force-dynamic';

export default async function ChatPage({
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
    return (
      <p className="text-[13px] text-[var(--ink-3)]">
        Keine Teammitglieder konfiguriert.
      </p>
    );
  }

  const fromCookie = cookieStore.get(ACTIVE_MEMBER_COOKIE)?.value;
  const me =
    members.find((m) => m.id === params.member) ??
    members.find((m) => m.id === fromCookie) ??
    members[0];

  return (
    <>
      <ViewToggle currentView="chat" memberId={me.id} />
      <div className="chat-page glass">
        <HermesChatShell />
      </div>
    </>
  );
}

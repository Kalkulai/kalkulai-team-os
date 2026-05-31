import Link from 'next/link';
import { LayoutList, Kanban, Megaphone, MessageCircle } from 'lucide-react';
import { campaignViewEnabledForMember } from '@/lib/campaign-access';

type View = 'day' | 'board' | 'chat' | 'campaigns';

export function ViewToggle({
  currentView,
  memberId,
}: {
  currentView: View;
  memberId: string;
}) {
  const q = `?member=${memberId}`;

  const base =
    'flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-[12px] font-medium transition-colors';
  const active = `${base} bg-white/[0.08] text-[var(--ink-1)]`;
  const inactive = `${base} text-[var(--ink-3)] hover:text-[var(--ink-2)]`;

  const cls = (v: View) => (currentView === v ? active : inactive);
  const showCampaigns = campaignViewEnabledForMember(memberId);

  return (
    <div className="mb-5 flex items-center gap-1 self-start rounded-[10px] border border-[var(--line-1)] bg-white/[0.04] p-1">
      <Link href={`/dashboard${q}`} className={cls('day')}>
        <LayoutList size={13} aria-hidden />
        Tag
      </Link>
      <Link href={`/dashboard/board${q}`} className={cls('board')}>
        <Kanban size={13} aria-hidden />
        Board
      </Link>
      {showCampaigns && (
        <Link href={`/dashboard/campaigns${q}`} className={cls('campaigns')}>
          <Megaphone size={13} aria-hidden />
          Kampagnen
        </Link>
      )}
      <Link href={`/dashboard/chat${q}`} className={cls('chat')}>
        <MessageCircle size={13} aria-hidden />
        Chat
      </Link>
    </div>
  );
}

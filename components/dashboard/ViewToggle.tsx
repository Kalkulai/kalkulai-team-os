import Link from 'next/link';
import { LayoutList, Kanban } from 'lucide-react';

export function ViewToggle({
  currentView,
  memberId,
}: {
  currentView: 'day' | 'board';
  memberId: string;
}) {
  const q = `?member=${memberId}`;
  const isDay = currentView === 'day';

  const base =
    'flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-[12px] font-medium transition-colors';
  const active = `${base} bg-white/[0.08] text-[var(--ink-1)]`;
  const inactive = `${base} text-[var(--ink-3)] hover:text-[var(--ink-2)]`;

  return (
    <div className="mb-5 flex items-center gap-1 self-start rounded-[10px] border border-[var(--line-1)] bg-white/[0.04] p-1">
      <Link href={`/dashboard${q}`} className={isDay ? active : inactive}>
        <LayoutList size={13} aria-hidden />
        Tag
      </Link>
      <Link href={`/dashboard/board${q}`} className={isDay ? inactive : active}>
        <Kanban size={13} aria-hidden />
        Board
      </Link>
    </div>
  );
}

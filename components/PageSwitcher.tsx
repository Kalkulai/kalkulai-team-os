'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calendar, MessageCircle, Settings, ChevronDown, Check, Building2, Bot, Map, TrendingUp } from 'lucide-react';
import { useActiveMember } from '@/lib/active-member';
import { isLeonMemberId } from '@/lib/agent-access';
import { salesOsEnabledForMember } from '@/lib/sales-access';

type Route =
  | '/dashboard'
  | '/dashboard/chat'
  | '/dashboard/company'
  | '/dashboard/agents'
  | '/dashboard/plan'
  | '/dashboard/sales'
  | '/settings';

interface PageDef {
  href: Route;
  title: string;
  Icon: typeof Calendar;
}

const PAGES: PageDef[] = [
  { href: '/dashboard',         title: 'Mein Tag',     Icon: Calendar },
  { href: '/dashboard/plan',    title: 'Plan',          Icon: Map },
  { href: '/dashboard/chat',    title: 'Chat',          Icon: MessageCircle },
  { href: '/dashboard/company', title: 'Firma',         Icon: Building2 },
  { href: '/dashboard/sales',   title: 'Sales',         Icon: TrendingUp },
  { href: '/dashboard/agents',  title: 'Agents',        Icon: Bot },
  { href: '/settings',          title: 'Einstellungen', Icon: Settings },
];

function activePageFor(pathname: string | null, pages: PageDef[]): PageDef {
  if (!pathname) return pages[0];
  const plan = pages.find((p) => p.href === '/dashboard/plan');
  if (plan && pathname.startsWith('/dashboard/plan')) return plan;
  const chat = pages.find((p) => p.href === '/dashboard/chat');
  if (chat && pathname.startsWith('/dashboard/chat')) return chat;
  const company = pages.find((p) => p.href === '/dashboard/company');
  if (company && pathname.startsWith('/dashboard/company')) return company;
  const sales = pages.find((p) => p.href === '/dashboard/sales');
  if (sales && pathname.startsWith('/dashboard/sales')) return sales;
  const agents = pages.find((p) => p.href === '/dashboard/agents');
  if (agents && pathname.startsWith('/dashboard/agents')) return agents;
  const settings = pages.find((p) => p.href === '/settings');
  if (settings && pathname.startsWith('/settings')) return settings;
  return pages[0];
}

export function PageSwitcher() {
  const pathname = usePathname();
  const { activeId } = useActiveMember();
  const pages = PAGES.filter((p) => {
    if (p.href === '/dashboard/agents') return isLeonMemberId(activeId);
    if (p.href === '/dashboard/sales') return salesOsEnabledForMember(activeId);
    return true;
  });
  const active = activePageFor(pathname, pages);

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div ref={wrapRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 leading-none transition-opacity hover:opacity-80"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="text-[16px] font-semibold leading-[1.2] tracking-[-0.01em] text-[var(--ink-1)]">
          {active.title}
        </span>
        <ChevronDown
          size={13}
          className={`text-[var(--ink-3)] transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <div
          className="dropmenu absolute left-0 top-[calc(100%+18px)] z-50 w-[220px] p-1.5"
          role="menu"
        >
          <div className="ovr px-2 pb-1 pt-2">Seite wechseln</div>
          {pages.map((p) => {
            const isActive = p.href === active.href;
            const Ic = p.Icon;
            return (
              <Link
                key={p.href}
                href={p.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13px] text-[var(--ink-1)] transition-colors hover:bg-white/[0.06]"
              >
                <Ic size={14} className="flex-none text-[var(--ink-3)]" aria-hidden />
                <span className="flex-1">{p.title}</span>
                {isActive && <Check size={14} className="text-[var(--brand)]" aria-hidden />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calendar, Users, MessageCircle, Settings, ChevronDown, Check } from 'lucide-react';

type Route = '/dashboard' | '/dashboard/team' | '/dashboard/chat' | '/settings';

interface PageDef {
  href: Route;
  title: string;
  Icon: typeof Calendar;
}

const PAGES: PageDef[] = [
  { href: '/dashboard',      title: 'Mein Tag',     Icon: Calendar },
  { href: '/dashboard/team', title: 'Team',         Icon: Users },
  { href: '/dashboard/chat', title: 'Chat',         Icon: MessageCircle },
  { href: '/settings',       title: 'Einstellungen', Icon: Settings },
];

function activePageFor(pathname: string | null): PageDef {
  if (!pathname) return PAGES[0];
  // /dashboard/team and /dashboard/chat must win over /dashboard
  const team = PAGES.find((p) => p.href === '/dashboard/team');
  if (team && pathname.startsWith('/dashboard/team')) return team;
  const chat = PAGES.find((p) => p.href === '/dashboard/chat');
  if (chat && pathname.startsWith('/dashboard/chat')) return chat;
  const settings = PAGES.find((p) => p.href === '/settings');
  if (settings && pathname.startsWith('/settings')) return settings;
  return PAGES[0];
}

export function PageSwitcher() {
  const pathname = usePathname();
  const active = activePageFor(pathname);

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
          {PAGES.map((p) => {
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

'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { useActiveMember } from '@/lib/active-member';
import type { TeamMember } from '@/types';

const ROLE_GRADIENT: Record<string, string> = {
  dev:    'linear-gradient(135deg,#5B8CFF,#3F5BFF)',
  founder:'linear-gradient(135deg,#3D4255,#1B1E2A)',
  sales:  'linear-gradient(135deg,#3FE0C5,#1F9B7E)',
};

function gradientFor(member: TeamMember | null): string {
  if (!member) return ROLE_GRADIENT.dev;
  return ROLE_GRADIENT[member.role] ?? ROLE_GRADIENT.dev;
}

function initialFor(name: string): string {
  return (name?.[0] ?? '?').toUpperCase();
}

function Inner() {
  const { members, activeMember, setActive } = useActiveMember();
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

  if (members.length === 0) {
    return <span className="hidden text-[12px] text-[var(--ink-3)] sm:inline">Lade …</span>;
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-[10px] border border-[var(--line-1)] bg-white/[0.04] py-[5px] pl-[5px] pr-[11px] transition-colors hover:border-[var(--line-2)] hover:bg-white/[0.08]"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span
          className="grid size-[26px] flex-none place-items-center rounded-full text-[11px] font-semibold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.15)_inset]"
          ref={(el) => {
            if (el) el.style.background = gradientFor(activeMember);
          }}
        >
          {activeMember ? initialFor(activeMember.name) : '?'}
        </span>
        <span className="flex flex-col items-start leading-[1.1]">
          <span className="text-[13px] font-medium text-[var(--ink-1)]">
            {activeMember?.name ?? '—'}
          </span>
          <span className="mt-0.5 text-[10px] font-medium uppercase leading-[1.2] tracking-[0.12em] text-[var(--ink-3)]">
            {activeMember?.role ?? ''}
          </span>
        </span>
        <ChevronDown size={12} className="text-[var(--ink-3)]" aria-hidden />
      </button>
      {open && (
        <div
          className="dropmenu absolute right-0 top-[calc(100%+16px)] z-50 w-[240px] p-1.5"
          role="menu"
        >
          <div className="ovr px-2 pb-1 pt-2">Team</div>
          {members.map((m) => {
            const isActive = m.id === activeMember?.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setActive(m.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-white/[0.06]"
                role="menuitem"
              >
                <span
                  className="grid size-[26px] flex-none place-items-center rounded-full text-[11px] font-semibold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.15)_inset]"
                  ref={(el) => {
                    if (el) el.style.background = ROLE_GRADIENT[m.role] ?? ROLE_GRADIENT.dev;
                  }}
                >
                  {initialFor(m.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium leading-[1.2] text-[var(--ink-1)]">
                    {m.name}
                  </span>
                  <span className="mt-0.5 block text-[10px] font-medium uppercase leading-[1.2] tracking-[0.12em] text-[var(--ink-3)]">
                    {m.role}
                  </span>
                </span>
                {isActive && <Check size={14} className="text-[var(--brand)]" aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MemberPill() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, GitBranch } from 'lucide-react';
import { MultiRingChart, type RingDatum } from '@/components/MultiRingChart';
import { ActivityTimeline, type ActivityDay } from '@/components/dashboard/ActivityTimeline';
import type { GitHubBranch, TeamMember } from '@/types';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

const ROLE_GRADIENT: Record<string, string> = {
  dev: 'linear-gradient(135deg,#5B8CFF,#3F5BFF)',
  sales: 'linear-gradient(135deg,#3FE0C5,#1F9B7E)',
  founder: 'linear-gradient(135deg,#3D4255,#1B1E2A)',
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

function gradientFor(role: string): string {
  return ROLE_GRADIENT[role] ?? ROLE_GRADIENT.dev;
}

export function MemberCard({
  member,
  rings,
  branches,
  activity,
  activeTasks,
}: {
  member: TeamMember;
  rings: RingDatum[];
  branches: GitHubBranch[];
  activity: ActivityDay[];
  activeTasks: number;
}) {
  const [open, setOpen] = useState(false);
  const eventCount = activity.reduce((n, d) => n + d.events.length, 0);

  return (
    <section className="glass card-rise overflow-hidden p-5">
      <header className="relative z-[1] mb-4 flex items-center gap-3">
        <span
          className="grid size-11 flex-none place-items-center rounded-full text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.15)_inset]"
          style={{ background: gradientFor(member.role) }}
        >
          {initials(member.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold tracking-tight text-[var(--ink-1)]">{member.name}</h3>
          <p className="ovr mt-0.5">{member.role}</p>
        </div>
        <span className="pill pill-mute mono" title="Aktive Linear-Tasks">
          {activeTasks} aktiv
        </span>
      </header>

      <Link
        href={`/dashboard/team/${member.id}/analytics`}
        className="relative z-[1] mb-4 grid place-items-center rounded-xl px-2 py-1 transition-colors hover:bg-white/[0.04]"
        title="Analytics → Wochen-/Monatsansicht"
      >
        <MultiRingChart data={rings} />
        <span className="mt-2 text-[11px] font-medium text-[var(--ink-3)]">Analytics ansehen →</span>
      </Link>

      {branches.length > 0 && (
        <div className="relative z-[1] mb-3 flex flex-wrap gap-1.5">
          {branches.map((b) => {
            const repoShort = b.repo?.split('/').pop();
            const titleParts = [
              b.repo ?? null,
              b.lastCommitDate
                ? `Letzter Commit ${formatDistanceToNow(parseISO(b.lastCommitDate), { locale: de, addSuffix: true })}`
                : null,
            ].filter(Boolean);
            return (
              <span
                key={`${b.repo ?? ''}:${b.name}`}
                className="inline-flex max-w-full items-center gap-1 rounded-[7px] border border-[var(--line-1)] bg-white/[0.04] px-2 py-1 mono text-[11px] text-[var(--ink-2)]"
                title={titleParts.join(' — ') || b.name}
              >
                <GitBranch size={10} className="flex-none text-[var(--ink-3)]" aria-hidden />
                {repoShort && (
                  <span className="rounded-[4px] bg-white/[0.06] px-1 py-[1px] text-[10px] text-[var(--ink-3)]">
                    {repoShort}
                  </span>
                )}
                <span className="truncate">{b.name}</span>
              </span>
            );
          })}
        </div>
      )}

      <div className="relative z-[1] border-t border-[var(--line-1)] pt-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left"
          aria-expanded={open}
        >
          <span className="ovr">Aktivität</span>
          <span className="flex items-center gap-2">
            <span className="mono text-[11px] text-[var(--ink-3)]">{eventCount} Events</span>
            <ChevronDown
              size={14}
              className="text-[var(--ink-3)] transition-transform"
              style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
              aria-hidden
            />
          </span>
        </button>
        {open && (
          <div className="mt-3">
            <ActivityTimeline days={activity} />
          </div>
        )}
      </div>
    </section>
  );
}

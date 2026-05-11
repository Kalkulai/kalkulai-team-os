'use client';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { TeamBranchView } from '@/components/TeamBranchView';
import type { GitHubBranch, TeamMember } from '@/types';

export function TeamBranchSection({
  branches,
  bots,
  members,
}: {
  branches: GitHubBranch[];
  bots: GitHubBranch[];
  members: TeamMember[];
}) {
  const [openHuman, setOpenHuman] = useState(false);
  const [openBots, setOpenBots] = useState(false);

  return (
    <div className="space-y-4">
      <section className="glass card-rise overflow-hidden">
        <button
          type="button"
          onClick={() => setOpenHuman((v) => !v)}
          className="relative z-[1] flex w-full items-baseline justify-between gap-2.5 px-5 pt-[18px] pb-[14px] text-left"
          aria-expanded={openHuman}
        >
          <span className="ovr">Aktive Branches</span>
          <span className="flex items-center gap-2">
            <span className="mono text-[12px] font-medium text-[var(--ink-3)]">{branches.length}</span>
            <ChevronDown
              size={14}
              className="text-[var(--ink-3)] transition-transform"
              style={{ transform: openHuman ? 'rotate(180deg)' : 'rotate(0deg)' }}
              aria-hidden
            />
          </span>
        </button>
        {openHuman && (
          <div className="relative z-[1] px-5 pb-4">
            <TeamBranchView branches={branches} members={members} />
          </div>
        )}
      </section>

      {bots.length > 0 && (
        <section className="glass card-rise overflow-hidden">
          <button
            type="button"
            onClick={() => setOpenBots((v) => !v)}
            className="relative z-[1] flex w-full items-baseline justify-between gap-2.5 px-5 pt-[18px] pb-[14px] text-left"
            aria-expanded={openBots}
          >
            <span className="ovr">Bot-Updates</span>
            <span className="flex items-center gap-2">
              <span className="mono text-[12px] font-medium text-[var(--ink-3)]">{bots.length}</span>
              <ChevronDown
                size={14}
                className="text-[var(--ink-3)] transition-transform"
                style={{ transform: openBots ? 'rotate(180deg)' : 'rotate(0deg)' }}
                aria-hidden
              />
            </span>
          </button>
          {openBots && (
            <div className="relative z-[1] px-5 pb-4">
              <TeamBranchView branches={bots} members={members} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}

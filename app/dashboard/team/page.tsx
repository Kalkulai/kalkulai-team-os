import { TeamBranchView } from '@/components/TeamBranchView';
import { KpiBar } from '@/components/KpiBar';
import { getActiveBranches } from '@/lib/github';
import { getAllActiveIssues } from '@/lib/linear';
import { getAllMembers } from '@/lib/supabase';
import { buildDailyBriefing } from '@/lib/aggregator';

export const dynamic = 'force-dynamic';

const GLASS =
  'rounded-2xl bg-card/70 backdrop-blur-xl ring-1 ring-foreground/5 ' +
  'shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset,0_8px_24px_-12px_rgba(0,0,0,0.12)] ' +
  'dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_8px_24px_-12px_rgba(0,0,0,0.5)] ' +
  'animate-[card-rise_400ms_cubic-bezier(0.22,1,0.36,1)_both]';

const ROLE_TONE: Record<string, string> = {
  dev: 'ring-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  sales: 'ring-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300',
  founder: 'ring-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
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

function toneFor(role: string): string {
  return ROLE_TONE[role] ?? 'ring-foreground/20 bg-foreground/5 text-foreground/80';
}

export default async function TeamPage() {
  const [branches, activeIssues, members] = await Promise.all([
    getActiveBranches(),
    getAllActiveIssues(),
    getAllMembers(),
  ]);

  const cards = await Promise.all(
    members.map(async (m) => {
      const briefing = await buildDailyBriefing(m);
      return {
        member: m,
        targets: briefing.weekTargets,
        actuals: briefing.weekActuals,
        activeTasks: activeIssues.filter((i) => i.assignee?.id === m.linear_user_id).length,
      };
    })
  );

  return (
    <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-6">
      <header className={`${GLASS} col-span-1 px-5 py-5 sm:px-6 sm:py-6 md:col-span-6`}>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Übersicht</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Team</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {members.length} {members.length === 1 ? 'Person' : 'Personen'} · {branches.length} aktive Branches
        </p>
      </header>

      <section className={`${GLASS} col-span-1 px-5 py-5 sm:px-6 sm:py-6 md:col-span-6`}>
        <header className="mb-4 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Aktive Branches</h2>
          <span className="text-xs tabular-nums text-muted-foreground">{branches.length}</span>
        </header>
        <TeamBranchView branches={branches} members={members} />
      </section>

      {cards.map(({ member, targets, actuals, activeTasks }) => (
        <section
          key={member.id}
          className={`${GLASS} col-span-1 px-5 py-5 sm:px-6 sm:py-6 md:col-span-3`}
        >
          <header className="mb-4 flex items-center gap-3">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-semibold ring-2 ${toneFor(member.role)}`}>
              {initials(member.name)}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-semibold tracking-tight">{member.name}</h3>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{member.role}</p>
            </div>
            <span className="shrink-0 rounded-md bg-foreground/[0.05] px-2 py-1 text-[11px] font-medium tabular-nums text-muted-foreground">
              {activeTasks} aktiv
            </span>
          </header>
          <div className="space-y-4">
            <KpiBar label="Tasks" actual={actuals.tasks_completed} target={targets.tasks_target} />
            {member.role === 'sales' && targets.calls_target > 0 && (
              <KpiBar label="Calls" actual={actuals.calls_made} target={targets.calls_target} />
            )}
            {member.role === 'dev' && targets.bugs_target > 0 && (
              <KpiBar label="Bugs" actual={actuals.bugs_fixed} target={targets.bugs_target} />
            )}
            {member.role === 'dev' && actuals.commits_count > 0 && (
              <div className="flex items-baseline justify-between border-t border-foreground/[0.06] pt-3">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Commits</span>
                <span className="text-sm font-medium tabular-nums">{actuals.commits_count}</span>
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

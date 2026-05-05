import { TaskList } from '@/components/TaskList';
import { MeetingList } from '@/components/MeetingList';
import { KpiBar } from '@/components/KpiBar';
import { MemberSwitcher } from '@/components/MemberSwitcher';
import { SalesLogger } from '@/components/SalesLogger';
import { buildDailyBriefing } from '@/lib/aggregator';
import { getAllMembers, getSalesLogsTodayByType } from '@/lib/supabase';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

export const dynamic = 'force-dynamic';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return 'Guten Morgen';
  if (h < 18) return 'Guten Tag';
  return 'Guten Abend';
}

function sortByPriority<T extends { priority: number }>(tasks: T[]): T[] {
  const rank = (p: number) => (p === 0 ? 99 : p);
  return [...tasks].sort((a, b) => {
    const aHigh = a.priority >= 1 && a.priority <= 2 ? 0 : 1;
    const bHigh = b.priority >= 1 && b.priority <= 2 ? 0 : 1;
    if (aHigh !== bHigh) return aHigh - bHigh;
    return rank(a.priority) - rank(b.priority);
  });
}

const GLASS =
  'rounded-2xl bg-card/70 backdrop-blur-xl ring-1 ring-foreground/5 ' +
  'shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset,0_8px_24px_-12px_rgba(0,0,0,0.12)] ' +
  'dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_8px_24px_-12px_rgba(0,0,0,0.5)] ' +
  'animate-[card-rise_400ms_cubic-bezier(0.22,1,0.36,1)_both]';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string }>;
}) {
  const [members, params] = await Promise.all([getAllMembers(), searchParams]);

  if (!members.length) {
    return (
      <div className="space-y-6">
        <p className="text-muted-foreground">Keine Teammitglieder konfiguriert. Bitte die Supabase-Tabelle befüllen.</p>
      </div>
    );
  }

  const me = members.find((m) => m.id === params.member) ?? members[0];
  const [briefing, todaySalesLogs] = await Promise.all([
    buildDailyBriefing(me),
    me.role === 'sales' ? getSalesLogsTodayByType(me.id) : Promise.resolve({}),
  ]);

  const showBugsKpi = me.role === 'dev' && briefing.weekTargets.bugs_target > 0;
  const showCallsKpi = me.role === 'sales' && briefing.weekTargets.calls_target > 0;
  const showCommits = me.role === 'dev' && briefing.weekActuals.commits_count > 0;
  const showSalesLogger = me.role === 'sales';
  const showInsights = briefing.unprocessedInsights.length > 0;

  return (
    <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-6">
      <section className={`${GLASS} col-span-1 px-5 py-5 sm:px-6 sm:py-6 md:col-span-6`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {format(new Date(), 'EEEE, d. MMMM', { locale: de })}
            </p>
            <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight sm:text-3xl">
              {greeting()}, {me.name}
            </h1>
            {briefing.activeBranch && (
              <p className="mt-2 text-xs text-muted-foreground">
                Aktiver Branch:{' '}
                <code className="rounded bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-foreground/80">
                  {briefing.activeBranch}
                </code>
              </p>
            )}
          </div>
          <div className="shrink-0">
            <MemberSwitcher members={members} currentId={me.id} />
          </div>
        </div>
      </section>

      <section className={`${GLASS} col-span-1 px-5 py-5 sm:px-6 sm:py-6 md:col-span-4`}>
        <header className="mb-4 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Deine Tasks</h2>
          <span className="text-xs tabular-nums text-muted-foreground">{briefing.tasks.length}</span>
        </header>
        <TaskList tasks={sortByPriority(briefing.tasks)} userId={me.id} />
      </section>

      <section className={`${GLASS} col-span-1 px-5 py-5 sm:px-6 sm:py-6 md:col-span-2`}>
        <header className="mb-4 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Meetings heute</h2>
          <span className="text-xs tabular-nums text-muted-foreground">{briefing.meetings.length}</span>
        </header>
        <MeetingList meetings={briefing.meetings} />
      </section>

      <section className={`${GLASS} col-span-1 px-5 py-5 sm:px-6 sm:py-6 md:col-span-3`}>
        <header className="mb-4">
          <h2 className="text-sm font-semibold tracking-tight">Diese Woche</h2>
        </header>
        <div className="space-y-5">
          <KpiBar
            label="Features / Tasks"
            actual={briefing.weekActuals.tasks_completed}
            target={briefing.weekTargets.tasks_target}
          />
          {showBugsKpi && (
            <KpiBar
              label="Bugs gefixt"
              actual={briefing.weekActuals.bugs_fixed}
              target={briefing.weekTargets.bugs_target}
            />
          )}
          {showCallsKpi && (
            <KpiBar
              label="Calls / Gespräche"
              actual={briefing.weekActuals.calls_made}
              target={briefing.weekTargets.calls_target}
            />
          )}
          {showCommits && (
            <div className="flex items-baseline justify-between border-t border-foreground/[0.06] pt-3">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Commits</span>
              <span className="text-sm font-medium tabular-nums">{briefing.weekActuals.commits_count}</span>
            </div>
          )}
        </div>
      </section>

      {showSalesLogger ? (
        <section className={`${GLASS} col-span-1 px-5 py-5 sm:px-6 sm:py-6 md:col-span-3`}>
          <header className="mb-4">
            <h2 className="text-sm font-semibold tracking-tight">Call loggen</h2>
          </header>
          <SalesLogger userId={me.id} initialCounts={todaySalesLogs} />
        </section>
      ) : showInsights ? (
        <InsightsCard
          insights={briefing.unprocessedInsights}
          className={`${GLASS} col-span-1 px-5 py-5 sm:px-6 sm:py-6 md:col-span-3`}
        />
      ) : null}

      {showSalesLogger && showInsights && (
        <InsightsCard
          insights={briefing.unprocessedInsights}
          dense
          className={`${GLASS} col-span-1 px-5 py-5 sm:px-6 sm:py-6 md:col-span-6`}
        />
      )}
    </div>
  );
}

function InsightsCard({
  insights,
  className,
  dense = false,
}: {
  insights: { id: string; title: string; url?: string }[];
  className: string;
  dense?: boolean;
}) {
  return (
    <section className={className}>
      <header className="mb-4 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold tracking-tight">Customer-Insights</h2>
        <span className="text-xs tabular-nums text-muted-foreground">{insights.length}</span>
      </header>
      <ul className={dense ? 'grid gap-2 sm:grid-cols-2' : 'space-y-2'}>
        {insights.map((ins) => (
          <li key={ins.id} className="text-sm">
            {ins.url ? (
              <a
                href={ins.url}
                target="_blank"
                rel="noopener noreferrer"
                className="-mx-2 flex items-start gap-2 rounded-lg px-2 py-1.5 text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
              >
                <span className="text-amber-500">💡</span>
                <span className="leading-snug">{ins.title}</span>
              </a>
            ) : (
              <span className="flex items-start gap-2 px-2 py-1.5 text-muted-foreground">
                <span className="text-amber-500">💡</span>
                <span className="leading-snug">{ins.title}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

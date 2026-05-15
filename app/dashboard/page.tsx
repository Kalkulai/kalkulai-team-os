import { cookies } from 'next/headers';
import { TaskList } from '@/components/TaskList';
import { MeetingList } from '@/components/MeetingList';
import { KpiTracker } from '@/components/KpiTracker';
import { ProjectsTracker } from '@/components/ProjectsTracker';
import { SalesFab } from '@/components/SalesFab';
import { HorizonCard, HorizonSection } from '@/components/dashboard/HorizonCard';
import { ActivityTimeline } from '@/components/dashboard/ActivityTimeline';
import { buildDailyBriefing } from '@/lib/aggregator';
import { buildActivityFeed } from '@/lib/activity';
import { getRecentlyMergedPRs } from '@/lib/github';
import { getAllMembers, getSalesLogsTodayByType } from '@/lib/supabase';
import { differenceInCalendarDays, format, getISOWeek, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { GitBranch } from 'lucide-react';

const ACTIVE_MEMBER_COOKIE = 'kalkulai-active-member';

export const dynamic = 'force-dynamic';

/**
 * Sort: overdue first, then due-today, then by Linear priority.
 * Tie-breaker for same urgency-bucket: lower priority number = more urgent.
 */
function sortTasks<T extends { priority: number; dueDate?: string | null }>(tasks: T[]): T[] {
  const now = new Date();
  function urgencyBucket(t: T): number {
    if (!t.dueDate) return 2; // no due-date = lowest urgency bucket
    try {
      const days = differenceInCalendarDays(parseISO(t.dueDate), now);
      if (days < 0) return 0; // overdue
      if (days === 0) return 1; // today
      return 2; // future
    } catch {
      return 2;
    }
  }
  const prioRank = (p: number) => (p === 0 ? 99 : p);
  return [...tasks].sort((a, b) => {
    const ub = urgencyBucket(a) - urgencyBucket(b);
    if (ub !== 0) return ub;
    return prioRank(a.priority) - prioRank(b.priority);
  });
}

export default async function DashboardPage({
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
        Keine Teammitglieder konfiguriert. Bitte die Supabase-Tabelle befüllen.
      </p>
    );
  }

  const fromCookie = cookieStore.get(ACTIVE_MEMBER_COOKIE)?.value;
  const me =
    members.find((m) => m.id === params.member) ??
    members.find((m) => m.id === fromCookie) ??
    members[0];
  const briefing = await buildDailyBriefing(me);
  const mergedPRs = await getRecentlyMergedPRs(2);
  const [activityDays, todaySalesLogs] = await Promise.all([
    buildActivityFeed(me, briefing.meetings, mergedPRs),
    me.role === 'sales' ? getSalesLogsTodayByType(me.id) : Promise.resolve({}),
  ]);

  const now = new Date();
  const dayShort = format(now, 'd. MMM', { locale: de });
  const heuteTitle = format(now, 'EEEE · d. MMMM', { locale: de });
  const weekNo = getISOWeek(now);
  const tasksSorted = sortTasks(briefing.tasks);
  const showSalesFab = me.role === 'sales';
  const activityCount = activityDays.reduce((n, d) => n + d.events.length, 0);

  return (
    <>
      {briefing.activeBranches.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2.5">
          {briefing.activeBranches.map((br) => {
            const repoShort = br.repo ? br.repo.split('/').pop() : null;
            const key = `${br.repo ?? ''}#${br.name}`;
            return (
              <span
                key={key}
                className="inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--line-1)] bg-white/[0.06] px-2.5 py-1 text-[11.5px] font-medium text-[var(--ink-2)] mono"
                title={br.repo ?? undefined}
              >
                <GitBranch size={11} className="text-[var(--ink-3)]" aria-hidden />
                {br.name}
                {br.prNumber && (
                  <span className="text-[var(--ink-3)]">#{br.prNumber}</span>
                )}
                {repoShort && (
                  <span className="ml-0.5 rounded-[4px] bg-white/[0.04] px-1 text-[10px] font-normal text-[var(--ink-3)]">
                    {repoShort}
                  </span>
                )}
              </span>
            );
          })}
          <span className="text-[12px] text-[var(--ink-3)]">
            {briefing.activeBranches.length === 1
              ? `aktiver Branch · ${me.name}`
              : `${briefing.activeBranches.length} aktive Branches · ${me.name}`}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-3 max-lg:grid-cols-2 max-[760px]:grid-cols-1">
        <HorizonCard number={1} title={heuteTitle} meta={dayShort} delayMs={40}>
          <HorizonSection label="Termine" end={<span className="mono">{briefing.meetings.length} heute</span>}>
            <MeetingList meetings={briefing.meetings} />
          </HorizonSection>
          <TaskList tasks={tasksSorted} userId={me.id} />
        </HorizonCard>

        <HorizonCard number={2} title="Diese Woche" meta={<span className="mono">KW {weekNo}</span>} delayMs={120}>
          <HorizonSection
            label="KPIs"
            end={
              <a href="/settings" className="hover:text-[var(--ink-1)]">
                anpassen
              </a>
            }
          >
            <KpiTracker userId={me.id} />
          </HorizonSection>
          <HorizonSection
            label="Projekte"
            end={
              <a href="/settings" className="hover:text-[var(--ink-1)]">
                anpassen
              </a>
            }
          >
            <ProjectsTracker userId={me.id} />
          </HorizonSection>
        </HorizonCard>

        <HorizonCard number={3} title="Aktivität" meta={<span className="mono">{activityCount} Events</span>} delayMs={200}>
          <HorizonSection label="Stream">
            <ActivityTimeline days={activityDays} />
          </HorizonSection>
        </HorizonCard>
      </div>

      {showSalesFab && (
        <SalesFab userId={me.id} initialCounts={todaySalesLogs} dayShort={dayShort} />
      )}
    </>
  );
}

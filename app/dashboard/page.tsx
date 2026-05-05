import { TaskList } from '@/components/TaskList';
import { MeetingList } from '@/components/MeetingList';
import { KpiTracker } from '@/components/KpiTracker';
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

  const showSalesLogger = me.role === 'sales';
  const kpiColSpan = showSalesLogger ? 'md:col-span-3' : 'md:col-span-6';

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

      <section className={`${GLASS} col-span-1 px-5 py-5 sm:px-6 sm:py-6 ${kpiColSpan}`}>
        <header className="mb-4 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Diese Woche</h2>
          <a
            href="/settings"
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            anpassen
          </a>
        </header>
        <KpiTracker userId={me.id} />
      </section>

      {showSalesLogger && (
        <section className={`${GLASS} col-span-1 px-5 py-5 sm:px-6 sm:py-6 md:col-span-3`}>
          <header className="mb-4">
            <h2 className="text-sm font-semibold tracking-tight">Call loggen</h2>
          </header>
          <SalesLogger userId={me.id} initialCounts={todaySalesLogs} />
        </section>
      )}
    </div>
  );
}

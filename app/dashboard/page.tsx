import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{greeting()}, {me.name}</h1>
          <p className="text-muted-foreground">{format(new Date(), 'EEEE, d. MMMM', { locale: de })}</p>
          {briefing.activeBranch && (
            <p className="text-xs text-muted-foreground mt-1">
              Aktiver Branch: <code className="bg-muted px-1 rounded">{briefing.activeBranch}</code>
            </p>
          )}
        </div>
        <MemberSwitcher members={members} currentId={me.id} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Deine Tasks</CardTitle></CardHeader>
          <CardContent><TaskList tasks={sortByPriority(briefing.tasks)} userId={me.id} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Meetings heute</CardTitle></CardHeader>
          <CardContent><MeetingList meetings={briefing.meetings} /></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Diese Woche</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <KpiBar label="Features / Tasks" actual={briefing.weekActuals.tasks_completed} target={briefing.weekTargets.tasks_target} />
          {me.role === 'dev' && briefing.weekTargets.bugs_target > 0 && (
            <KpiBar label="Bugs gefixt" actual={briefing.weekActuals.bugs_fixed} target={briefing.weekTargets.bugs_target} />
          )}
          {me.role === 'sales' && briefing.weekTargets.calls_target > 0 && (
            <KpiBar label="Calls / Gespräche" actual={briefing.weekActuals.calls_made} target={briefing.weekTargets.calls_target} />
          )}
          {me.role === 'dev' && briefing.weekActuals.commits_count > 0 && (
            <p className="text-sm text-muted-foreground">
              Commits diese Woche: <span className="font-medium text-foreground">{briefing.weekActuals.commits_count}</span>
            </p>
          )}
          {me.role === 'sales' && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-sm font-medium">Call loggen</p>
                <SalesLogger userId={me.id} initialCounts={todaySalesLogs} />
              </div>
            </>
          )}
          {briefing.unprocessedInsights.length > 0 && (
            <>
              <Separator />
              <p className="text-sm font-medium">Neue Customer-Insights</p>
              <ul className="space-y-1">
                {briefing.unprocessedInsights.map((ins) => (
                  <li key={ins.id} className="text-sm">
                    {ins.url ? (
                      <a
                        href={ins.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground hover:underline"
                      >
                        💡 {ins.title}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">💡 {ins.title}</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

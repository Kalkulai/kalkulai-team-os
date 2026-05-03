import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { TaskList } from '@/components/TaskList';
import { MeetingList } from '@/components/MeetingList';
import { KpiBar } from '@/components/KpiBar';
import { MemberSwitcher } from '@/components/MemberSwitcher';
import { SalesLogger } from '@/components/SalesLogger';
import { buildDailyBriefing } from '@/lib/aggregator';
import { getAllMembers } from '@/lib/supabase';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

export const dynamic = 'force-dynamic';

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
  const briefing = await buildDailyBriefing(me);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Guten Morgen, {me.name}</h1>
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
          <CardContent><TaskList tasks={briefing.tasks} userId={me.id} /></CardContent>
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
          {me.role === 'sales' && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-sm font-medium">Call loggen</p>
                <SalesLogger userId={me.id} />
              </div>
            </>
          )}
          {briefing.unprocessedInsights.length > 0 && (
            <>
              <Separator />
              <p className="text-sm font-medium">Neue Customer-Insights</p>
              <ul className="space-y-1">
                {briefing.unprocessedInsights.map((ins) => (
                  <li key={ins.id} className="text-sm text-muted-foreground">
                    💡 {ins.title}
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

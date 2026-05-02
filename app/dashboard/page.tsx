import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { TaskList } from '@/components/TaskList';
import { MeetingList } from '@/components/MeetingList';
import { KpiBar } from '@/components/KpiBar';
import { buildDailyBriefing } from '@/lib/aggregator';
import { getAllMembers } from '@/lib/supabase';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

export default async function DashboardPage() {
  const members = await getAllMembers();
  const me = members[0];
  const briefing = await buildDailyBriefing(me);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Guten Morgen, {me.name}</h1>
        <p className="text-muted-foreground">{format(new Date(), 'EEEE, d. MMMM', { locale: de })}</p>
        {briefing.activeBranch && (
          <p className="text-xs text-muted-foreground mt-1">
            Aktiver Branch: <code className="bg-muted px-1 rounded">{briefing.activeBranch}</code>
          </p>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Deine Tasks</CardTitle></CardHeader>
          <CardContent><TaskList tasks={briefing.tasks} /></CardContent>
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
          {me.role === 'sales' && (
            <KpiBar label="Calls / Gespräche" actual={briefing.weekActuals.calls_made} target={briefing.weekTargets.calls_target} />
          )}
          {briefing.unprocessedInsights > 0 && (
            <>
              <Separator />
              <p className="text-sm text-muted-foreground">
                {briefing.unprocessedInsights} neue Interview-Insights in Notion warten
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

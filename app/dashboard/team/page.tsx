import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TeamBranchView } from '@/components/TeamBranchView';
import { KpiBar } from '@/components/KpiBar';
import { getActiveBranches } from '@/lib/github';
import { getAllActiveIssues } from '@/lib/linear';
import { getAllMembers, getWeekTargets, getWeekActuals, currentWeekStart } from '@/lib/supabase';

export default async function TeamPage() {
  const weekStart = currentWeekStart();
  const [branches, activeIssues, members] = await Promise.all([
    getActiveBranches(),
    getAllActiveIssues(),
    getAllMembers(),
  ]);

  const cards = await Promise.all(
    members.map(async (m) => {
      const [targets, actuals] = await Promise.all([
        getWeekTargets(m.id, weekStart),
        getWeekActuals(m.id, weekStart),
      ]);
      return {
        member: m,
        targets,
        actuals,
        activeTasks: activeIssues.filter((i) => i.assignee?.id === m.linear_user_id).length,
      };
    })
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Team-Übersicht</h1>
      <Card>
        <CardHeader><CardTitle>Aktive Branches</CardTitle></CardHeader>
        <CardContent><TeamBranchView branches={branches} members={members} /></CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {cards.map(({ member, targets, actuals, activeTasks }) => (
          <Card key={member.id}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                {member.name}
                <span className="text-xs font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{member.role}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <KpiBar label="Tasks" actual={actuals.tasks_completed} target={targets.tasks_target} />
              {member.role === 'sales' && targets.calls_target > 0 && (
                <KpiBar label="Calls" actual={actuals.calls_made} target={targets.calls_target} />
              )}
              <p className="text-xs text-muted-foreground">{activeTasks} Tasks aktiv in Linear</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

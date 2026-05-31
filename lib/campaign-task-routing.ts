import type { LinearIssue } from '@/types';
import { createIssue, ensureLabelId, getLinearTeamId } from '@/lib/linear';

export async function createLinearFollowupTask(args: {
  assigneeId: string;
  title: string;
  description: string;
  dueDate?: string | null;
}): Promise<LinearIssue> {
  const teamId = await getLinearTeamId();
  const labelId = await ensureLabelId(teamId, 'Campaign');
  return createIssue(
    teamId,
    args.title,
    args.assigneeId,
    [labelId],
    2,
    args.dueDate ?? null,
    args.description,
  );
}

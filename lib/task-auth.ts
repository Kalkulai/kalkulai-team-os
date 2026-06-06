import { supabaseAdmin } from '@/lib/supabase';
import { getIssueAssigneeUserId } from '@/lib/linear';
import type { AuthActor } from '@/lib/auth-context';

/** Members may only mutate (edit/delete) Linear issues assigned to them.
 * Service/bearer actors (Hermes, cron, ops) are trusted and bypass this. */
export async function memberCanMutateIssue(actor: AuthActor, issueId: string): Promise<boolean> {
  if (actor.type !== 'member') return true;
  if (!actor.memberId) return false;
  const { data, error } = await supabaseAdmin
    .from('team_members')
    .select('linear_user_id')
    .eq('id', actor.memberId)
    .single();
  if (error || !data?.linear_user_id) return false;
  const assignee = await getIssueAssigneeUserId(issueId);
  return assignee !== null && assignee === data.linear_user_id;
}

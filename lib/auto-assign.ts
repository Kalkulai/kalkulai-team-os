import type { TeamMember } from '@/types';

/**
 * Linear webhook payload fields we care about for the auto-assign-on-close
 * fallback (KAL-132). The dev-side task-tracker hooks already cover most
 * close paths, but Linear-UI closes and pre-marketplace sessions still slip
 * through and land on the dashboard as unassigned "Done" tickets, which then
 * silently fall out of every per-member view and the daily-recap audit.
 */
export interface LinearWebhookActor {
  id?: string;
  name?: string;
  email?: string;
}

export interface LinearWebhookIssueData {
  id?: string;
  identifier?: string;
  assigneeId?: string | null;
  assignee?: { id?: string } | null;
  state?: { name?: string; type?: string };
}

export interface LinearWebhookPayload {
  action: 'create' | 'update' | 'remove';
  type: string;
  data?: LinearWebhookIssueData;
  updatedFrom?: { stateId?: string; assigneeId?: string | null } | null;
  actor?: LinearWebhookActor | null;
}

export type MemberLookup = Pick<TeamMember, 'id' | 'name' | 'linear_user_id'> & {
  email?: string | null;
};

export interface AutoAssignTarget {
  issueId: string;
  identifier: string | null;
  assigneeLinearId: string;
  matchedMemberName: string;
  matchedBy: 'actor-id' | 'actor-email';
}

/** Pure resolver — given a webhook payload + the member roster, decide whether
 *  this is an "unassigned issue just got closed" event and, if so, which
 *  member should be assigned. Returns null when the event is irrelevant or no
 *  match is found.
 *
 *  Match precedence: actor.id == member.linear_user_id (cheapest, most
 *  reliable) → actor.email (falls back when Linear emits a service-account
 *  actor id we don't know but the email maps). */
export function resolveAutoAssign(
  payload: LinearWebhookPayload,
  members: MemberLookup[],
): AutoAssignTarget | null {
  if (payload.type !== 'Issue' || payload.action !== 'update') return null;
  const data = payload.data;
  if (!data?.id) return null;

  const stateType = data.state?.type;
  if (stateType !== 'completed') return null;

  const currentAssigneeId = data.assigneeId ?? data.assignee?.id ?? null;
  if (currentAssigneeId) return null;

  const actor = payload.actor;
  if (!actor) return null;

  let matched: MemberLookup | undefined;
  let matchedBy: AutoAssignTarget['matchedBy'] | null = null;

  if (actor.id) {
    matched = members.find((m) => m.linear_user_id === actor.id);
    if (matched) matchedBy = 'actor-id';
  }
  if (!matched && actor.email) {
    const needle = actor.email.toLowerCase();
    matched = members.find((m) => (m.email ?? '').toLowerCase() === needle);
    if (matched) matchedBy = 'actor-email';
  }
  if (!matched || !matched.linear_user_id || !matchedBy) return null;

  return {
    issueId: data.id,
    identifier: data.identifier ?? null,
    assigneeLinearId: matched.linear_user_id,
    matchedMemberName: matched.name,
    matchedBy,
  };
}

import { describe, it, expect } from 'vitest';
import { resolveAutoAssign, type LinearWebhookPayload, type MemberLookup } from '@/lib/auto-assign';

const LEON: MemberLookup = {
  id: 'sup-leon',
  name: 'Leon',
  email: 'leon.prothmann.b@gmail.com',
  linear_user_id: 'lin-leon',
};
const FELIX: MemberLookup = {
  id: 'sup-felix',
  name: 'Felix',
  email: 'felix@example.com',
  linear_user_id: 'lin-felix',
};
const MEMBERS = [LEON, FELIX];

function basePayload(): LinearWebhookPayload {
  return {
    action: 'update',
    type: 'Issue',
    data: {
      id: 'iss-1',
      identifier: 'KAL-999',
      assigneeId: null,
      assignee: null,
      state: { name: 'Done', type: 'completed' },
    },
    updatedFrom: { stateId: 'state-todo' },
    actor: { id: 'lin-leon' },
  };
}

describe('resolveAutoAssign', () => {
  it('returns target when closed-unassigned matches actor.id → linear_user_id', () => {
    const target = resolveAutoAssign(basePayload(), MEMBERS);
    expect(target).toEqual({
      issueId: 'iss-1',
      identifier: 'KAL-999',
      assigneeLinearId: 'lin-leon',
      matchedMemberName: 'Leon',
      matchedBy: 'actor-id',
    });
  });

  it('falls back to actor.email when actor.id is unknown', () => {
    const payload = basePayload();
    payload.actor = { id: 'unknown-service-id', email: 'FELIX@example.com' };
    const target = resolveAutoAssign(payload, MEMBERS);
    expect(target?.matchedBy).toBe('actor-email');
    expect(target?.assigneeLinearId).toBe('lin-felix');
  });

  it('returns null when issue still has an assignee', () => {
    const payload = basePayload();
    payload.data!.assigneeId = 'lin-felix';
    expect(resolveAutoAssign(payload, MEMBERS)).toBeNull();
  });

  it('returns null when state.type is not completed', () => {
    const payload = basePayload();
    payload.data!.state = { name: 'In Progress', type: 'started' };
    expect(resolveAutoAssign(payload, MEMBERS)).toBeNull();
  });

  it('returns null on Comment events', () => {
    const payload = basePayload();
    payload.type = 'Comment';
    expect(resolveAutoAssign(payload, MEMBERS)).toBeNull();
  });

  it('returns null when actor matches no member', () => {
    const payload = basePayload();
    payload.actor = { id: 'unknown', email: 'stranger@example.com' };
    expect(resolveAutoAssign(payload, MEMBERS)).toBeNull();
  });

  it('returns null when actor is missing entirely (system mutation)', () => {
    const payload = basePayload();
    payload.actor = null;
    expect(resolveAutoAssign(payload, MEMBERS)).toBeNull();
  });

  it('is idempotent — running twice on the now-assigned payload returns null', () => {
    const payload = basePayload();
    const first = resolveAutoAssign(payload, MEMBERS);
    expect(first).not.toBeNull();
    payload.data!.assigneeId = first!.assigneeLinearId;
    expect(resolveAutoAssign(payload, MEMBERS)).toBeNull();
  });
});

import { supabaseAdmin } from '@/lib/supabase';
import type { ActorScope, AuthActor } from '@/lib/auth-context';

export interface AuditEventInput {
  actor: AuthActor;
  scope?: ActorScope;
  action: string;
  resourceType?: string;
  resourceId?: string;
  onBehalfOfMemberId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  const { error } = await supabaseAdmin
    .from('team_os_audit_events')
    .insert({
      actor_type: input.actor.type,
      actor_id: input.actor.id,
      scope: input.scope ?? null,
      action: input.action,
      resource_type: input.resourceType ?? null,
      resource_id: input.resourceId ?? null,
      on_behalf_of_member_id: input.onBehalfOfMemberId ?? input.actor.memberId ?? null,
      metadata: input.metadata ?? {},
    });
  if (error) {
    console.warn('[audit] insert failed', { action: input.action, error: error.message });
  }
}

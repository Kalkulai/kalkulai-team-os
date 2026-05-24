import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { revalidateDashboard } from '@/lib/revalidate';
import { broadcastKanbanEvent } from '@/lib/realtime';
import { resolveAutoAssign, type LinearWebhookPayload } from '@/lib/auto-assign';
import { getAllMembers } from '@/lib/supabase';
import { updateIssueAssignee, addIssueComment } from '@/lib/linear';

export const runtime = 'nodejs';
export const maxDuration = 15;

/**
 * Linear sends `Linear-Signature` = HMAC-SHA256(body) using the webhook secret.
 * Hex-encoded, no `sha256=` prefix (unlike GitHub).
 * https://linear.app/developers/webhooks
 */
function verifyLinearSignature(body: string, signature: string | null): boolean {
  if (!signature) return false;
  const secret = process.env.LINEAR_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('linear-signature');

  if (!verifyLinearSignature(body, sig)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let payload: LinearWebhookPayload;
  try {
    payload = JSON.parse(body) as LinearWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  // Only react to Issue updates where the state actually changed.
  const isIssueStateChange =
    payload.type === 'Issue' &&
    payload.action === 'update' &&
    !!payload.updatedFrom?.stateId;

  let broadcastResult: string = 'skipped';
  if (isIssueStateChange) {
    revalidateDashboard();
    try {
      await broadcastKanbanEvent({
        kind: 'issue-state-change',
        identifier: payload.data?.identifier ?? null,
        newState: payload.data?.state?.name ?? null,
        at: new Date().toISOString(),
      });
      broadcastResult = 'ok';
    } catch (err) {
      broadcastResult = `err: ${err instanceof Error ? err.message : String(err)}`;
    }
    console.log('[webhook/linear] state change', {
      id: payload.data?.identifier,
      newState: payload.data?.state?.name,
      broadcast: broadcastResult,
    });
  }

  // KAL-132: auto-assign closed-but-unassigned tickets to the actor who
  // closed them. Runs after the state-change broadcast so the realtime UI
  // still updates immediately; the assignee mutation lands a moment later
  // and triggers a second webhook with the assignee populated.
  let autoAssign: { result: string; identifier: string | null; member: string | null } = {
    result: 'skipped',
    identifier: null,
    member: null,
  };
  try {
    const members = await getAllMembers();
    const target = resolveAutoAssign(payload, members);
    if (target) {
      await updateIssueAssignee(target.issueId, target.assigneeLinearId);
      await addIssueComment(
        target.issueId,
        `Auto-assigned to **${target.matchedMemberName}** via webhook (matched by ${target.matchedBy}).`,
      ).catch((err) => {
        // Comment is best-effort — the assignment already landed.
        console.warn('[webhook/linear] auto-assign comment failed', err);
      });
      autoAssign = {
        result: 'assigned',
        identifier: target.identifier,
        member: target.matchedMemberName,
      };
      console.log('[webhook/linear] auto-assigned', {
        identifier: target.identifier,
        member: target.matchedMemberName,
        matchedBy: target.matchedBy,
      });
    }
  } catch (err) {
    autoAssign = {
      result: `err: ${err instanceof Error ? err.message : String(err)}`,
      identifier: payload.data?.identifier ?? null,
      member: null,
    };
    console.error('[webhook/linear] auto-assign failed', err);
  }

  return NextResponse.json({
    ok: true,
    handled: isIssueStateChange,
    broadcast: broadcastResult,
    autoAssign,
    received: {
      action: payload.action,
      type: payload.type,
      identifier: payload.data?.identifier,
      hasUpdatedFrom: !!payload.updatedFrom,
      updatedFromKeys: payload.updatedFrom ? Object.keys(payload.updatedFrom) : [],
    },
  });
}

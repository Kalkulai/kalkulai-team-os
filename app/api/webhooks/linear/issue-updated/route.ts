import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { revalidateDashboard } from '@/lib/revalidate';

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

interface LinearWebhookPayload {
  action: 'create' | 'update' | 'remove';
  type: string; // "Issue" | "Comment" | ...
  data?: {
    id?: string;
    identifier?: string;
    state?: { name?: string; type?: string };
  };
  updatedFrom?: { stateId?: string } | null;
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

  if (isIssueStateChange) {
    revalidateDashboard();
    console.log('[webhook/linear] issue state change', {
      id: payload.data?.identifier,
      newState: payload.data?.state?.name,
    });
  }

  return NextResponse.json({ ok: true, handled: isIssueStateChange });
}

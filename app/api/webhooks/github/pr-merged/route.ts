import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { setIssueStatus } from '@/lib/linear';
import { extractLinearIdFromBranch } from '@/lib/branch-parser';

export const maxDuration = 30;

function verifyGithubSignature(body: string, signature: string | null): boolean {
  if (!signature) return false;
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return false;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(body);
  const expected = `sha256=${hmac.digest('hex')}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

async function getLinearIssueIdByIdentifier(identifier: string): Promise<string | null> {
  const num = parseInt(identifier.split('-')[1] ?? '', 10);
  if (Number.isNaN(num)) return null;

  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      Authorization: process.env.LINEAR_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `query GetIssueByNumber($num: Float!) {
        issues(filter: { number: { eq: $num } }) { nodes { id identifier } }
      }`,
      variables: { num },
    }),
  });

  const json = (await res.json()) as {
    data?: { issues: { nodes: Array<{ id: string; identifier: string }> } };
  };
  return json.data?.issues.nodes.find((n) => n.identifier === identifier)?.id ?? null;
}

type PullRequestEvent = {
  action: string;
  pull_request: {
    merged: boolean;
    head: { ref: string };
    title: string;
    html_url: string;
  };
};

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('x-hub-signature-256');
  const event = req.headers.get('x-github-event');

  if (!verifyGithubSignature(body, signature)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  if (event !== 'pull_request') {
    return NextResponse.json({ skipped: 'not a PR event' });
  }

  let payload: PullRequestEvent;
  try {
    payload = JSON.parse(body) as PullRequestEvent;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (payload.action !== 'closed' || !payload.pull_request.merged) {
    return NextResponse.json({ skipped: 'PR not merged' });
  }

  const linearId =
    extractLinearIdFromBranch(payload.pull_request.head.ref) ??
    extractLinearIdFromBranch(payload.pull_request.title);

  if (!linearId) {
    return NextResponse.json({ skipped: 'no linear id found' });
  }

  const stateId = process.env.LINEAR_DONE_STATE_ID;
  if (!stateId) {
    return NextResponse.json({ error: 'LINEAR_DONE_STATE_ID not configured' }, { status: 500 });
  }

  const issueId = await getLinearIssueIdByIdentifier(linearId);
  if (!issueId) {
    return NextResponse.json({ skipped: `issue ${linearId} not found` });
  }

  await setIssueStatus(issueId, stateId);

  return NextResponse.json({
    ok: true,
    closed: linearId,
    prUrl: payload.pull_request.html_url,
  });
}

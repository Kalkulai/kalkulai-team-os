import { NextRequest, NextResponse } from 'next/server';
import { requireActor, hasValidServiceBearer } from '@/lib/auth-context';
import { runExtraction } from '@/lib/sales-insights';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Vercel Cron sends GET — only Bearer auth (CRON_SECRET), runs stale-only by default
export async function GET(req: NextRequest) {
  if (!hasValidServiceBearer(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(await runExtraction({ force: false }));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Manual trigger from browser (session) or service (Bearer)
export async function POST(req: NextRequest) {
  const sessionActor = await requireActor(req, { allowMember: true, scopes: ['sales:write'] });
  if (!sessionActor && !hasValidServiceBearer(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { force, companyId } = await req.json().catch(() => ({})) as { force?: boolean; companyId?: string };
  try {
    return NextResponse.json(await runExtraction({ force, companyId }));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

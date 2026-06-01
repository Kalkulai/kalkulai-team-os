import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { runFinanceSync } from '@/lib/finance-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Dünner Wrapper um runFinanceSync(). Trigger:
 *  - Vercel-Cron → GET mit CRON_SECRET
 *  - CFO-Kai/Hermes → POST mit DASHBOARD_API_SECRET
 *
 * ok:false (Daten-/Gate-Problem) wird bewusst als 200 zurückgegeben — das ist
 * KEIN Call-Fehler, der Cron soll nicht endlos retryen, der Alarm ging bereits
 * raus. Nur unerwartete Exceptions werden zu 500.
 */
async function handle(req: NextRequest): Promise<NextResponse> {
  if (!requireApiAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runFinanceSync();
    if (result.ok) {
      return NextResponse.json({ ok: true, id: result.id });
    }
    return NextResponse.json({ ok: false, reason: result.reason });
  } catch (err) {
    // runFinanceSync wirft per Vertrag nicht — dies fängt nur das Unerwartete.
    const message = err instanceof Error ? err.message : 'unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export function GET(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}

export function POST(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}

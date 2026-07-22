import { NextRequest, NextResponse } from 'next/server';
import { requireActor } from '@/lib/auth-context';
import { supabaseAdmin } from '@/lib/supabase';
import { updateColdStreak } from '@/lib/sales-os';

export const dynamic = 'force-dynamic';

const OUTCOMES = ['reached', 'voicemail', 'no_answer', 'busy', 'not_interested', 'appointment'] as const;
type Outcome = (typeof OUTCOMES)[number];

function isOutcome(v: unknown): v is Outcome {
  return typeof v === 'string' && (OUTCOMES as readonly string[]).includes(v);
}

const COLD_STREAK_OUTCOMES: Outcome[] = ['voicemail', 'no_answer', 'busy'];
const STREAK_RESET_OUTCOMES: Outcome[] = ['reached', 'appointment'];

export async function POST(req: NextRequest) {
  const actor = await requireActor(req, { allowMember: true, scopes: ['sales:write'] });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.companyId || typeof body.companyId !== 'string') {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 });
  }

  const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;
  const outcome = isOutcome(body.outcome) ? body.outcome : null;
  const durationMin = typeof body.duration_min === 'number' ? Math.round(body.duration_min) : null;
  const contactId = typeof body.contactId === 'string' ? body.contactId : null;
  const nextStepInput = typeof body.next_step === 'string' ? body.next_step.trim() || null : null;

  const titleParts: string[] = ['Call'];
  if (outcome === 'voicemail') titleParts.push('(Voicemail)');
  else if (outcome === 'no_answer') titleParts.push('(Kein Anschluss)');
  else if (outcome === 'busy') titleParts.push('(Besetzt)');
  else if (outcome === 'not_interested') titleParts.push('(Kein Interesse)');
  else if (outcome === 'appointment') titleParts.push('(Termin vereinbart)');
  if (durationMin) titleParts.push(`${durationMin} Min`);
  const title = titleParts.join(' ');

  const now = new Date().toISOString();

  const { error: actErr } = await supabaseAdmin.from('sales_activities').insert({
    company_id: body.companyId,
    contact_id: contactId,
    activity_type: 'call',
    direction: 'outbound',
    source_system: 'manual',
    provider_event_id: `manual-call-${body.companyId}-${Date.now()}`,
    title,
    summary: notes,
    occurred_at: now,
    meta: { outcome, duration_min: durationMin },
  });
  if (actErr) return NextResponse.json({ error: actErr.message }, { status: 500 });

  if (nextStepInput) {
    await supabaseAdmin
      .from('sales_companies')
      .update({ next_step: nextStepInput, updated_at: now })
      .eq('id', body.companyId);
  }

  // cold_streak update (fire-and-forget, non-blocking)
  if (outcome && COLD_STREAK_OUTCOMES.includes(outcome)) {
    updateColdStreak(body.companyId, 'increment').catch(() => undefined);
  } else if (outcome && STREAK_RESET_OUTCOMES.includes(outcome)) {
    updateColdStreak(body.companyId, 'reset').catch(() => undefined);
  }

  return NextResponse.json({ ok: true });
}

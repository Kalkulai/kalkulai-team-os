import { NextRequest, NextResponse } from 'next/server';
import { requireActor } from '@/lib/auth-context';
import { PAUL_MEMBER_ID } from '@/lib/sales-access';
import { getCompanyDetail, updateAiSummary } from '@/lib/sales-os';
import { sendToHermes } from '@/lib/hermes-chat';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor(req, { allowMember: true, scopes: ['sales:write'] });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const memberId = actor.type === 'member' && actor.memberId
    ? actor.memberId
    : (req.nextUrl.searchParams.get('memberId') ?? PAUL_MEMBER_ID);

  const { id } = await params;
  const detail = await getCompanyDetail(id, memberId);
  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const recentActivities = detail.activities
    .filter((a) => a.activity_type !== 'sync')
    .slice(0, 10);

  const activityLines = recentActivities.map((a) => {
    const date = a.occurred_at.slice(0, 10);
    const type = a.activity_type.toUpperCase();
    const summary = a.summary ? ` — ${a.summary.slice(0, 300)}` : '';
    return `${date} [${type}] ${a.title}${summary}`;
  }).join('\n');

  const ins = detail.insights_json;
  const insightsSummary = ins ? [
    ins.buying_signal !== 'unknown' ? `Signal: ${ins.buying_signal}` : '',
    (ins.pain_points?.length ?? 0) > 0 ? `Pain Points: ${ins.pain_points.join(', ')}` : '',
    (ins.software_used?.length ?? 0) > 0 ? `Software: ${ins.software_used.join(', ')}` : '',
    ins.notes ? `Notiz: ${ins.notes}` : '',
  ].filter(Boolean).join(' | ') : '';

  const prompt = `Du bist Sales-Assistent bei KalkulAI. Erstelle eine kompakte Pre-Call-Zusammenfassung für Firma "${detail.name}".

Firmendaten:
- Stage: ${detail.stage}
- Branche: ${detail.industry ?? '—'}
- Kontakte: ${detail.contacts.map((c) => `${c.first_name} ${c.last_name}${c.role ? ` (${c.role})` : ''}`).join(', ') || '—'}
- Nächster Schritt: ${detail.next_step ?? '—'}
${insightsSummary ? `- KI-Insights: ${insightsSummary}` : ''}

Letzte Aktivitäten:
${activityLines || '— Noch keine Aktivitäten —'}

Gib eine Zusammenfassung in genau 3 Sätzen zurück:
1. Wer ist diese Firma und was ist die aktuelle Beziehungssituation?
2. Was sind die wichtigsten Themen/Pain Points aus bisherigen Gesprächen?
3. Was ist der sinnvollste Fokus für das nächste Gespräch?

Nur diese 3 Sätze, kein Markdown, keine Einleitung.`;

  try {
    const summary = await sendToHermes({ message: prompt });
    await updateAiSummary(id, summary);
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

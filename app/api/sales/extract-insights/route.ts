import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { sendToHermes } from '@/lib/hermes-chat';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function buildPrompt(name: string, summaries: string): string {
  return `Du bist ein Sales-Analyst. Analysiere diese Gesprächsnotizen für Firma "${name}" und antworte NUR mit einem validen JSON-Objekt (kein Markdown, keine Erklärung):

${summaries}

Gewünschtes JSON-Format:
{
  "employee_count": <integer oder null>,
  "software_used": ["<software>", ...],
  "interests": ["<feature/thema>", ...],
  "buying_signal": "<hot|warm|cold|unknown>",
  "pain_points": ["<problem>", ...],
  "notes": "<1-2 Sätze Kernaussage über den Kunden>"
}`;
}

export async function POST(req: NextRequest) {
  if (!requireApiAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { force, companyId } = await req.json().catch(() => ({})) as { force?: boolean; companyId?: string };

  // Get transcripts
  let txQuery = supabaseAdmin
    .from('sales_activities')
    .select('company_id,title,summary,occurred_at,meta')
    .eq('activity_type', 'transcript')
    .order('occurred_at', { ascending: true })
    .limit(2000);

  const { data: transcripts, error: txError } = await txQuery;
  if (txError) return NextResponse.json({ error: txError.message }, { status: 500 });

  const byCompany = new Map<string, typeof transcripts>();
  for (const t of transcripts ?? []) {
    if (companyId && t.company_id !== companyId) continue;
    if (!byCompany.has(t.company_id)) byCompany.set(t.company_id, []);
    byCompany.get(t.company_id)!.push(t);
  }

  // Get company info
  const ids = [...byCompany.keys()];
  const { data: companies } = await supabaseAdmin
    .from('sales_companies')
    .select('id,name,insights_json')
    .in('id', ids);

  const companyName = new Map((companies ?? []).map((c) => [c.id, c.name as string]));
  const hasInsights = new Map((companies ?? []).map((c) => [c.id, !!c.insights_json]));

  const results: { name: string; status: 'updated' | 'skipped' | 'failed'; error?: string }[] = [];

  for (const [cid, txList] of byCompany) {
    const name = companyName.get(cid) ?? 'Unbekannt';

    if (hasInsights.get(cid) && !force) {
      results.push({ name, status: 'skipped' });
      continue;
    }

    const summaries = (txList ?? [])
      .filter((t) => t.summary || t.title)
      .map((t) => {
        const parts = [`[${(t.occurred_at ?? '').slice(0, 10)}] ${t.title}`];
        if (t.summary) parts.push(t.summary);
        const kt = (t.meta as Record<string, unknown>)?.key_takeaways as string | undefined;
        if (kt) parts.push(`Takeaways:\n${kt}`);
        return parts.join('\n');
      })
      .join('\n\n---\n\n');

    if (!summaries.trim()) { results.push({ name, status: 'skipped' }); continue; }

    try {
      const reply = await sendToHermes({ message: buildPrompt(name, summaries) });

      let insights: Record<string, unknown>;
      try {
        insights = JSON.parse(reply);
      } catch {
        const match = reply.match(/\{[\s\S]*\}/);
        if (!match) throw new Error(`No JSON: ${reply.slice(0, 100)}`);
        insights = JSON.parse(match[0]);
      }

      insights.last_analyzed_at = new Date().toISOString();

      await supabaseAdmin
        .from('sales_companies')
        .update({ insights_json: insights })
        .eq('id', cid);

      results.push({ name, status: 'updated' });
    } catch (e) {
      results.push({ name, status: 'failed', error: (e as Error).message });
    }
  }

  const updated = results.filter((r) => r.status === 'updated').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  return NextResponse.json({ updated, skipped: results.length - updated - failed, failed, results });
}

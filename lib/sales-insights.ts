import { supabaseAdmin } from '@/lib/supabase';
import { sendToHermes } from '@/lib/hermes-chat';

export interface ExtractionResult {
  updated: number;
  skipped: number;
  failed: number;
  results: { name: string; status: 'updated' | 'skipped' | 'failed'; error?: string }[];
}

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

function isStale(insightsJson: Record<string, unknown> | null, latestTxAt: string): boolean {
  if (!insightsJson) return true;
  const analyzedAt = insightsJson.last_analyzed_at as string | null;
  if (!analyzedAt) return true;
  return new Date(latestTxAt) > new Date(analyzedAt);
}

export async function runExtraction(opts: { force?: boolean; companyId?: string }): Promise<ExtractionResult> {
  const { force = false, companyId } = opts;

  const { data: transcripts, error: txError } = await supabaseAdmin
    .from('sales_activities')
    .select('company_id,title,summary,occurred_at,meta')
    .eq('activity_type', 'transcript')
    .order('occurred_at', { ascending: true })
    .limit(2000);
  if (txError) throw new Error(txError.message);

  const byCompany = new Map<string, typeof transcripts>();
  const latestTxAt = new Map<string, string>();
  for (const t of transcripts ?? []) {
    if (companyId && t.company_id !== companyId) continue;
    if (!byCompany.has(t.company_id)) byCompany.set(t.company_id, []);
    byCompany.get(t.company_id)!.push(t);
    if (!latestTxAt.has(t.company_id) || t.occurred_at > latestTxAt.get(t.company_id)!) {
      latestTxAt.set(t.company_id, t.occurred_at);
    }
  }

  const ids = [...byCompany.keys()];
  const { data: companies } = await supabaseAdmin
    .from('sales_companies')
    .select('id,name,insights_json')
    .in('id', ids);

  const companyName = new Map((companies ?? []).map((c) => [c.id, c.name as string]));
  const companyInsights = new Map((companies ?? []).map((c) => [c.id, c.insights_json as Record<string, unknown> | null]));

  const results: ExtractionResult['results'] = [];

  for (const [cid, txList] of byCompany) {
    const name = companyName.get(cid) ?? 'Unbekannt';
    const insights = companyInsights.get(cid) ?? null;
    const newest = latestTxAt.get(cid) ?? '';

    if (!force && !isStale(insights, newest)) {
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

      let newInsights: Record<string, unknown>;
      try {
        newInsights = JSON.parse(reply);
      } catch {
        const match = reply.match(/\{[\s\S]*\}/);
        if (!match) throw new Error(`No JSON: ${reply.slice(0, 100)}`);
        newInsights = JSON.parse(match[0]);
      }

      newInsights.last_analyzed_at = new Date().toISOString();

      await supabaseAdmin
        .from('sales_companies')
        .update({ insights_json: newInsights })
        .eq('id', cid);

      results.push({ name, status: 'updated' });
    } catch (e) {
      results.push({ name, status: 'failed', error: (e as Error).message });
    }
  }

  const updated = results.filter((r) => r.status === 'updated').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  return { updated, skipped: results.length - updated - failed, failed, results };
}

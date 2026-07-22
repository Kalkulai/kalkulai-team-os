import { supabaseAdmin } from '@/lib/supabase';
import { sendToHermes } from '@/lib/hermes-chat';

export interface ExtractionResult {
  updated: number;
  skipped: number;
  failed: number;
  results: { name: string; status: 'updated' | 'skipped' | 'failed'; error?: string }[];
}

function buildPrompt(name: string, summaries: string, txCount: number): string {
  return `Du bist Sales-Analyst bei KalkulAI (Kalkulationssoftware für Handwerk/Fertigung/Bau).
Analysiere alle ${txCount} Gesprächsnotizen für Firma "${name}" und antworte NUR mit einem validen JSON-Objekt (kein Markdown, keine Erklärung):

${summaries}

JSON-Format (alle Felder pflicht, leere Arrays statt null erlaubt):
{
  "employee_count": <integer oder null>,
  "current_workflow": "<wie kalkulieren sie heute: Excel/Papier/Software X/manuell — oder null>",
  "supplier_info": "<wo kaufen sie Materialien/Produkte ein, wichtige Lieferanten — oder null>",
  "software_used": ["<aktuelle Software, z.B. Excel, SAP, Lexware>"],
  "interests": ["<konkrete Features/Themen die sie interessieren>"],
  "use_cases": ["<wie würden sie KalkulAI konkret nutzen, z.B. Angebotserstellung, Nachkalkulation>"],
  "buying_signal": "<hot|warm|cold|unknown>",
  "purchase_intent": "<definite|likely|maybe|unlikely|unknown — Kaufabsicht einschätzen>",
  "pilot_committed": <true wenn Kunde explizit Pilot-Teilnahme zugesagt hat, sonst false>,
  "decision_maker_identified": <true wenn Entscheider bekannt und kontaktiert>,
  "key_stakeholders": ["<Name (Rolle) bekannter Entscheider/Beeinflusser>"],
  "pain_points": ["<konkrete Probleme/Schmerzpunkte>"],
  "objections": ["<geäußerte Einwände gegen KalkulAI>"],
  "next_best_action": "<konkreter nächster Sales-Schritt — oder null>",
  "notes": "<1-2 Sätze Kernaussage über diesen Kunden>"
}`;
}

function isStale(insightsJson: Record<string, unknown> | null, latestTxAt: string): boolean {
  if (!insightsJson) return true;
  const analyzedAt = insightsJson.last_analyzed_at as string | null;
  if (!analyzedAt) return true;
  return new Date(latestTxAt) > new Date(analyzedAt);
}

export async function runExtraction(opts: {
  force?: boolean;
  companyId?: string;
  limit?: number;
}): Promise<ExtractionResult> {
  const { force = false, companyId, limit = 10 } = opts;

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
    .select('id,name,insights_json,pilot_status')
    .in('id', ids);

  const companyName = new Map((companies ?? []).map((c) => [c.id, c.name as string]));
  const companyInsights = new Map((companies ?? []).map((c) => [c.id, c.insights_json as Record<string, unknown> | null]));
  const companyPilotStatus = new Map((companies ?? []).map((c) => [c.id, c.pilot_status as string | null]));

  const results: ExtractionResult['results'] = [];
  let processed = 0;

  for (const [cid, txList] of byCompany) {
    const name = companyName.get(cid) ?? 'Unbekannt';
    const insights = companyInsights.get(cid) ?? null;
    const newest = latestTxAt.get(cid) ?? '';

    if (!force && !isStale(insights, newest)) {
      results.push({ name, status: 'skipped' });
      continue;
    }

    // Enforce per-run limit to avoid 300s Vercel timeout
    if (processed >= limit) {
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

    const txCount = (txList ?? []).length;

    try {
      const reply = await sendToHermes({ message: buildPrompt(name, summaries, txCount) });

      let newInsights: Record<string, unknown>;
      try {
        newInsights = JSON.parse(reply);
      } catch {
        const match = reply.match(/\{[\s\S]*\}/);
        if (!match) throw new Error(`No JSON: ${reply.slice(0, 100)}`);
        newInsights = JSON.parse(match[0]);
      }

      // pilot_committed is an AI hint — strip from insights_json, persist in pilot_status column
      const pilotCommitted = Boolean(newInsights.pilot_committed);
      delete newInsights.pilot_committed;

      newInsights.last_analyzed_at = new Date().toISOString();
      newInsights.transcript_count_analyzed = txCount;

      const dbUpdate: Record<string, unknown> = { insights_json: newInsights };
      // Only set 'committed' if not already confirmed as 'active' by humans
      if (pilotCommitted && companyPilotStatus.get(cid) !== 'active') {
        dbUpdate.pilot_status = 'committed';
      }

      await supabaseAdmin
        .from('sales_companies')
        .update(dbUpdate)
        .eq('id', cid);

      processed++;
      results.push({ name, status: 'updated' });
    } catch (e) {
      processed++;
      results.push({ name, status: 'failed', error: (e as Error).message });
    }
  }

  const updated = results.filter((r) => r.status === 'updated').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  return { updated, skipped: results.length - updated - failed, failed, results };
}

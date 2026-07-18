/**
 * Extracts structured customer insights from Notion transcripts per company.
 * Requires:
 *   SUPABASE_KEY=<service_role_key>
 *   ANTHROPIC_API_KEY=<key>
 *   ANTHROPIC_MODEL=<model-id>   e.g. claude-haiku-4-5-20251001
 *
 * Run: node scripts/extract-insights.mjs
 */

const SB_URL = 'https://jtakzjvaxctmnpzsszrf.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL;

if (!SB_KEY) throw new Error('SUPABASE_KEY missing');
if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY missing');
if (!MODEL) throw new Error('ANTHROPIC_MODEL missing (e.g. claude-haiku-4-5-20251001)');

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text}`);
  return text ? JSON.parse(text) : null;
}

// 1. Find all companies that have at least one transcript
const transcripts = await sbFetch(
  'sales_activities?activity_type=eq.transcript&select=company_id,title,summary,occurred_at,meta&order=occurred_at.asc&limit=1000'
);

const byCompany = new Map();
for (const t of transcripts) {
  if (!byCompany.has(t.company_id)) byCompany.set(t.company_id, []);
  byCompany.get(t.company_id).push(t);
}

console.log(`Found ${byCompany.size} companies with transcripts`);

// 2. Get company names
const companyIds = [...byCompany.keys()];
const companies = await sbFetch(
  `sales_companies?id=in.(${companyIds.join(',')})&select=id,name`
);
const companyName = new Map(companies.map((c) => [c.id, c.name]));

// 3. Extract insights per company
const SYSTEM = `Du bist ein Sales-Analyst. Extrahiere strukturierte Infos aus deutschen Kundengespräch-Protokollen.
Antworte NUR mit einem validen JSON-Objekt, kein Markdown, keine Erklärung.`;

const PROMPT_TEMPLATE = (name, summaries) => `Firma: ${name}

Gesprächsnotizen:
${summaries}

Extrahiere folgendes JSON:
{
  "employee_count": <integer oder null>,
  "software_used": ["<software1>", ...],
  "interests": ["<feature/thema1>", ...],
  "buying_signal": "<hot|warm|cold|unknown>",
  "pain_points": ["<problem1>", ...],
  "notes": "<1-2 Sätze Kernaussage über den Kunden>"
}`;

let updated = 0, failed = 0;

for (const [companyId, txList] of byCompany) {
  const name = companyName.get(companyId) ?? 'Unbekannt';
  const summaries = txList
    .filter((t) => t.summary || t.title)
    .map((t) => {
      const parts = [`[${(t.occurred_at || '').slice(0, 10)}] ${t.title}`];
      if (t.summary) parts.push(t.summary);
      const kt = t.meta?.key_takeaways;
      if (kt) parts.push(`Takeaways:\n${kt}`);
      return parts.join('\n');
    })
    .join('\n\n---\n\n');

  if (!summaries.trim()) { console.log(`SKIP ${name}: no content`); continue; }

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        system: SYSTEM,
        messages: [{ role: 'user', content: PROMPT_TEMPLATE(name, summaries) }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error(`API error for ${name}: ${resp.status} ${err}`);
      failed++;
      continue;
    }

    const msg = await resp.json();
    const text = msg.content[0]?.text ?? '';

    let insights;
    try {
      insights = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error(`No JSON in: ${text.slice(0, 200)}`);
      insights = JSON.parse(match[0]);
    }

    insights.last_analyzed_at = new Date().toISOString();

    await sbFetch(
      `sales_companies?id=eq.${companyId}`,
      { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ insights_json: insights }) }
    );

    console.log(`OK ${name}: ${insights.buying_signal}, ${insights.employee_count} MA, sw: ${(insights.software_used ?? []).join(', ')}`);
    updated++;

    // Rate limit: ~3 req/s
    await new Promise((r) => setTimeout(r, 350));
  } catch (e) {
    console.error(`FAIL ${name}:`, e.message);
    failed++;
  }
}

console.log(`\nDone: ${updated} updated, ${failed} failed.`);

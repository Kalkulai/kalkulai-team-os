/**
 * Extracts structured customer insights from Notion transcripts per company.
 * Uses the Hermes bridge (same AI as the OS) — no Anthropic key needed.
 *
 * Requires:
 *   SUPABASE_KEY=<service_role_key>
 *   HERMES_BRIDGE_URL=<url>
 *   HERMES_BRIDGE_TOKEN=<token>
 *
 * Run: node scripts/extract-insights.mjs
 */

const SB_URL = 'https://jtakzjvaxctmnpzsszrf.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY;
const HERMES_URL = process.env.HERMES_BRIDGE_URL;
const HERMES_TOKEN = process.env.HERMES_BRIDGE_TOKEN;

if (!SB_KEY) throw new Error('SUPABASE_KEY missing');
if (!HERMES_URL) throw new Error('HERMES_BRIDGE_URL missing');
if (!HERMES_TOKEN) throw new Error('HERMES_BRIDGE_TOKEN missing');

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function callHermes(message) {
  const res = await fetch(`${HERMES_URL.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${HERMES_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Hermes ${res.status}: ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  return (data.reply ?? '').trim();
}

// 1. Find all companies with at least one transcript
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
  `sales_companies?id=in.(${companyIds.join(',')})&select=id,name,insights_json`
);
const companyName = new Map(companies.map((c) => [c.id, c.name]));
const hasInsights = new Map(companies.map((c) => [c.id, !!c.insights_json]));

const PROMPT = (name, summaries) =>
  `Du bist ein Sales-Analyst. Analysiere diese Gesprächsnotizen für Firma "${name}" und antworte NUR mit einem validen JSON-Objekt (kein Markdown, keine Erklärung):

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

let updated = 0, skipped = 0, failed = 0;
const forceRefresh = process.argv.includes('--force');

for (const [companyId, txList] of byCompany) {
  const name = companyName.get(companyId) ?? 'Unbekannt';

  if (hasInsights.get(companyId) && !forceRefresh) {
    console.log(`SKIP ${name}: bereits analysiert (--force zum Überschreiben)`);
    skipped++;
    continue;
  }

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

  if (!summaries.trim()) { console.log(`SKIP ${name}: kein Inhalt`); skipped++; continue; }

  try {
    const reply = await callHermes(PROMPT(name, summaries));

    let insights;
    try {
      insights = JSON.parse(reply);
    } catch {
      const match = reply.match(/\{[\s\S]*\}/);
      if (!match) throw new Error(`Kein JSON in Antwort: ${reply.slice(0, 200)}`);
      insights = JSON.parse(match[0]);
    }

    insights.last_analyzed_at = new Date().toISOString();

    await sbFetch(
      `sales_companies?id=eq.${companyId}`,
      { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ insights_json: insights }) }
    );

    console.log(`OK ${name}: ${insights.buying_signal}, ${insights.employee_count ?? '?'} MA, sw: ${(insights.software_used ?? []).join(', ')}`);
    updated++;

    await new Promise((r) => setTimeout(r, 500));
  } catch (e) {
    console.error(`FAIL ${name}:`, e.message);
    failed++;
  }
}

console.log(`\nFertig: ${updated} aktualisiert, ${skipped} übersprungen, ${failed} fehlgeschlagen.`);

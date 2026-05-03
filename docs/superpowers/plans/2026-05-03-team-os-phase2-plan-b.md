# Team OS — Plan B: Auth, Briefing-Cron, Webhooks, Conflict-Hook

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan A's read-heavy Dashboard wird zu einem aktiven Team-Tracker. Vier Bausteine: (1) Vercel-Password schließt das Public-URL-Loch, (2) ein Telegram-Cron pusht 06:00 Uhr ein personalisiertes Tagesbriefing, (3) ein GitHub-Webhook schließt Linear-Issues automatisch wenn Branches mergen, (4) ein Claude-Code-Hook im Hauptrepo warnt vor Doppelbearbeitung bevor du `git checkout -b` läufst.

**Architecture:** Drei neue Backend-Endpoints (briefing/send, webhooks/github/pr-merged) in der bestehenden Next.js-App. Telegram-Sender und Briefing-Formatter als Library-Helpers. Branch-Parser ist eine reine Funktion. GitHub-Webhook nutzt HMAC-Verify gegen `GITHUB_WEBHOOK_SECRET`. Conflict-Hook ist ein Bash-Skript im **anderen** Repo (`kalkulai`), das `/api/conflicts` aus Plan A callt. Vercel-Password ist eine UI-Einstellung — kein Code.

**Tech Stack:** Next.js 16 App Router, Telegram Bot API, GitHub Webhooks, Vercel Cron (deklariert in `vercel.json`), shell-Hook + Node-Helper im Claude-Code-Hauptrepo.

---

## Prerequisites (manuell, ~15 Min)

| Variable | Woher | Status |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | bereits in `.env.local` + Vercel | ✓ vorhanden |
| `team_members.telegram_chat_id` | Pro Person: `/start` an den Bot, dann `https://api.telegram.org/bot<TOKEN>/getUpdates` → `message.chat.id` ablesen | offen |
| `GITHUB_WEBHOOK_SECRET` | `openssl rand -hex 32` — neu generieren, in Vercel + GitHub-Webhook eintragen | offen |
| `CRON_SECRET` | `openssl rand -hex 32` — Vercel setzt `Authorization: Bearer <CRON_SECRET>` Header automatisch | offen |
| `KALKULAI_TEAM_OS_URL` | `https://kalkulai-team-os.vercel.app` — wird im Hauptrepo-Hook gebraucht | ✓ bekannt |

---

## File Structure

```
kalkulai-team-os/
├── lib/
│   ├── telegram.ts                              # NEW
│   ├── briefing-format.ts                       # NEW
│   └── branch-parser.ts                         # NEW
├── app/
│   └── api/
│       ├── briefing/send/route.ts               # NEW
│       └── webhooks/github/pr-merged/route.ts   # NEW
└── vercel.json                                  # already correct from Plan A

# Im Hauptrepo (separates repo):
kalkulai/
└── .claude/
    ├── hooks/
    │   └── conflict-check.js                    # NEW
    └── settings.json                            # MODIFY (PreToolUse hook eintragen)
```

---

## Task 1: Vercel Password Protection (1 Klick, ~30 Sek)

**Files:** keine

- [ ] **Step 1:** https://vercel.com/leons-projects-1a41e692/kalkulai-team-os/settings/deployment-protection öffnen
- [ ] **Step 2:** **"Vercel Authentication"** auf **"Standard Protection"** stellen — schützt Production + Preview, jeder mit Vercel-Account-Zugriff zum Projekt darf rein
- [ ] **Step 3:** ODER **"Password Protection"** wenn ihr ein gemeinsames Passwort wollt statt Vercel-Account-Login
- [ ] **Step 4:** Speichern. Verifizieren:
  ```powershell
  curl -I https://kalkulai-team-os.vercel.app/dashboard
  # erwartet: HTTP 401 oder Redirect zu Vercel-Login
  ```

> **Wichtig:** Webhook- und Cron-Routes müssen vom Auth-Layer ausgenommen werden — siehe Task 10 Step 5 für die Bypass-Konfiguration.

---

## Task 2: Telegram-IDs sammeln + DB-Update

**Files:** keine — direktes SQL

- [ ] **Step 1:** Jeder Teammensch öffnet den Bot in Telegram, klickt **"Start"**.
- [ ] **Step 2:** Du callst (PowerShell):
  ```powershell
  $token = (Get-Content .env.local | Select-String '^TELEGRAM_BOT_TOKEN=').ToString().Split('=')[1]
  curl "https://api.telegram.org/bot$token/getUpdates"
  # JSON parsen: result[].message.chat.id pro Person notieren
  ```
- [ ] **Step 3:** In Supabase SQL Editor:
  ```sql
  update team_members set telegram_chat_id = '12345678' where name = 'Leon';
  update team_members set telegram_chat_id = '87654321' where name = 'Felix';
  -- usw.
  ```
- [ ] **Step 4:** Verify:
  ```sql
  select name, telegram_chat_id from team_members where telegram_chat_id is not null;
  ```

---

## Task 3: Telegram-Sender Library

**Files:**
- Create: `lib/telegram.ts`

- [ ] **Step 1: Sender schreiben**

```typescript
// lib/telegram.ts

const API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN!}`;

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  parseMode: 'Markdown' | 'HTML' = 'Markdown'
): Promise<{ ok: boolean; error?: string }> {
  if (!chatId) return { ok: false, error: 'no chat_id' };

  const res = await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    return { ok: false, error: `telegram ${res.status}: ${errBody.slice(0, 200)}` };
  }
  return { ok: true };
}
```

- [ ] **Step 2: Commit**
```bash
git add lib/telegram.ts
git commit -m "feat: add telegram sender helper"
```

---

## Task 4: Briefing-Formatter

**Files:**
- Create: `lib/briefing-format.ts`

- [ ] **Step 1: Formatter schreiben**

```typescript
// lib/briefing-format.ts
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import type { DailyBriefing } from '@/types';

export function formatBriefingMarkdown(b: DailyBriefing): string {
  const date = format(new Date(), 'EEEE, d. MMMM', { locale: de });
  const lines: string[] = [];

  lines.push(`*Guten Morgen, ${b.member.name}* — ${date}`);
  lines.push('');

  if (b.activeBranch) {
    lines.push(`Aktiver Branch: \`${b.activeBranch}\``);
    lines.push('');
  }

  if (b.tasks.length > 0) {
    lines.push('*Deine Tasks*');
    for (const t of b.tasks.slice(0, 5)) {
      const prio = t.priority === 1 ? '🔥 ' : t.priority === 2 ? '⚡ ' : '';
      lines.push(`• ${prio}${t.identifier} — ${t.title}`);
    }
    if (b.tasks.length > 5) lines.push(`  …und ${b.tasks.length - 5} weitere`);
    lines.push('');
  }

  if (b.meetings.length > 0) {
    lines.push('*Heute*');
    for (const m of b.meetings) {
      try {
        const t = format(parseISO(m.start), 'HH:mm', { locale: de });
        lines.push(`• ${t} — ${m.summary}${m.isSalesCall ? ' (Sales)' : ''}`);
      } catch {
        lines.push(`• ${m.summary}`);
      }
    }
    lines.push('');
  }

  lines.push('*Diese Woche*');
  lines.push(`Tasks: ${b.weekActuals.tasks_completed}/${b.weekTargets.tasks_target}`);
  if (b.member.role === 'sales') {
    lines.push(`Calls: ${b.weekActuals.calls_made}/${b.weekTargets.calls_target}`);
  }
  if (b.member.role === 'dev' && b.weekTargets.bugs_target > 0) {
    lines.push(`Bugs: ${b.weekActuals.bugs_fixed}/${b.weekTargets.bugs_target}`);
  }

  if (b.unprocessedInsights > 0) {
    lines.push('');
    lines.push(`💡 ${b.unprocessedInsights} neue Notion-Insights`);
  }

  return lines.join('\n');
}
```

- [ ] **Step 2: Commit**
```bash
git add lib/briefing-format.ts
git commit -m "feat: add markdown briefing formatter"
```

---

## Task 5: Briefing-Send Route + Cron-Auth

**Files:**
- Create: `app/api/briefing/send/route.ts`
- `vercel.json` (kein Code-Change, der Cron-Path stimmt schon aus Plan A)

- [ ] **Step 1: Route schreiben**

```typescript
// app/api/briefing/send/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAllMembers } from '@/lib/supabase';
import { buildDailyBriefing } from '@/lib/aggregator';
import { sendTelegramMessage } from '@/lib/telegram';
import { formatBriefingMarkdown } from '@/lib/briefing-format';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Vercel-Cron sendet Authorization: Bearer <CRON_SECRET>
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const members = await getAllMembers();
  const recipients = members.filter((m) => m.telegram_chat_id);

  const results = await Promise.allSettled(
    recipients.map(async (m) => {
      const briefing = await buildDailyBriefing(m);
      const text = formatBriefingMarkdown(briefing);
      const send = await sendTelegramMessage(m.telegram_chat_id!, text);
      return { member: m.name, send };
    })
  );

  const summary = results.map((r, i) => ({
    member: recipients[i].name,
    status: r.status,
    detail: r.status === 'fulfilled' ? r.value.send : String(r.reason),
  }));

  return NextResponse.json({ ok: true, sent: recipients.length, summary });
}
```

- [ ] **Step 2: `CRON_SECRET` setzen**

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$secret = -join ($bytes | ForEach-Object { '{0:x2}' -f $_ })
Add-Content .env.local "CRON_SECRET=$secret"
# Anschließend in Vercel-Dashboard: Settings → Environment Variables → Add → CRON_SECRET (Production + Preview)
```

- [ ] **Step 3: Lokal testen**
```powershell
$cron = (Get-Content .env.local | Select-String '^CRON_SECRET=').ToString().Split('=')[1]
curl -H "Authorization: Bearer $cron" http://localhost:3000/api/briefing/send
# erwartet: {"ok":true,"sent":N,"summary":[...]}
```

- [ ] **Step 4: Commit**
```bash
git add app/api/briefing/send/
git commit -m "feat: add cron briefing send route with auth"
```

- [ ] **Step 5:** Push → Auto-Deploy → ersten Cron-Run abwarten (06:00 Uhr UTC) ODER manuell auslösen über Vercel-Dashboard → Crons → **"Run Now"**.

---

## Task 6: Branch-Name → Linear-ID Parser

**Files:**
- Create: `lib/branch-parser.ts`

- [ ] **Step 1: Parser schreiben**

```typescript
// lib/branch-parser.ts

// Linear-Identifier-Format: <TEAM>-<NUMBER>, z.B. "kal-42", "ENG-1234"
const LINEAR_ID_RE = /\b([a-z]{2,5}-\d{1,6})\b/i;

export function extractLinearIdFromBranch(branchName: string): string | null {
  const match = branchName.match(LINEAR_ID_RE);
  return match ? match[1].toUpperCase() : null;
}

export function extractLinearIdFromText(text: string): string | null {
  return extractLinearIdFromBranch(text);
}
```

- [ ] **Step 2: Smoke-Test**
```bash
node -e "
const { extractLinearIdFromBranch } = require('./lib/branch-parser');
console.log(extractLinearIdFromBranch('feature/kal-42-add-login'));
console.log(extractLinearIdFromBranch('main'));
console.log(extractLinearIdFromBranch('ENG-1234/refactor'));
"
# erwartet: KAL-42, null, ENG-1234
```

- [ ] **Step 3: Commit**
```bash
git add lib/branch-parser.ts
git commit -m "feat: add branch-name linear-id parser"
```

---

## Task 7: GitHub-Webhook → Linear Auto-Close

**Files:**
- Create: `app/api/webhooks/github/pr-merged/route.ts`

- [ ] **Step 1: HMAC-verify + Route schreiben**

```typescript
// app/api/webhooks/github/pr-merged/route.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { setIssueStatus } from '@/lib/linear';
import { extractLinearIdFromBranch } from '@/lib/branch-parser';

export const maxDuration = 30;

function verifyGithubSignature(body: string, signature: string | null): boolean {
  if (!signature) return false;
  const secret = process.env.GITHUB_WEBHOOK_SECRET!;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(body);
  const expected = `sha256=${hmac.digest('hex')}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('x-hub-signature-256');
  const event = req.headers.get('x-github-event');

  if (!verifyGithubSignature(body, signature)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  if (event !== 'pull_request') return NextResponse.json({ skipped: 'not a PR event' });

  const payload = JSON.parse(body) as {
    action: string;
    pull_request: { merged: boolean; head: { ref: string }; title: string; html_url: string };
  };

  if (payload.action !== 'closed' || !payload.pull_request.merged) {
    return NextResponse.json({ skipped: 'PR not merged' });
  }

  const linearId =
    extractLinearIdFromBranch(payload.pull_request.head.ref) ??
    extractLinearIdFromBranch(payload.pull_request.title);

  if (!linearId) return NextResponse.json({ skipped: 'no linear id found' });

  const issueId = await getLinearIssueIdByIdentifier(linearId);
  if (!issueId) return NextResponse.json({ skipped: `issue ${linearId} not found` });

  await setIssueStatus(issueId, process.env.LINEAR_DONE_STATE_ID!);

  return NextResponse.json({ ok: true, closed: linearId, prUrl: payload.pull_request.html_url });
}

async function getLinearIssueIdByIdentifier(identifier: string): Promise<string | null> {
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      Authorization: process.env.LINEAR_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `query { issues(filter: { number: { eq: ${parseInt(identifier.split('-')[1], 10)} } }) { nodes { id identifier } } }`,
    }),
  });
  const json = (await res.json()) as { data?: { issues: { nodes: Array<{ id: string; identifier: string }> } } };
  return json.data?.issues.nodes.find((n) => n.identifier === identifier)?.id ?? null;
}
```

- [ ] **Step 2: `GITHUB_WEBHOOK_SECRET` generieren + setzen**
```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$secret = -join ($bytes | ForEach-Object { '{0:x2}' -f $_ })
Add-Content .env.local "GITHUB_WEBHOOK_SECRET=$secret"
# Vercel: Settings → Environment Variables → Add GITHUB_WEBHOOK_SECRET (Production + Preview)
```

- [ ] **Step 3: GitHub-Webhook im Hauptrepo registrieren** → https://github.com/Kalkulai/kalkulai/settings/hooks → **Add Webhook**
  - Payload URL: `https://kalkulai-team-os.vercel.app/api/webhooks/github/pr-merged`
  - Content type: `application/json`
  - Secret: `GITHUB_WEBHOOK_SECRET` aus Step 2
  - Events: nur **"Pull requests"** anhaken
  - Active: ✓

- [ ] **Step 4: Commit**
```bash
git add app/api/webhooks/github/
git commit -m "feat: add github pr-merged webhook for linear auto-close"
```

- [ ] **Step 5: Verify** — Test-PR mit `kal-99-test` Branch mergen → GitHub-Webhook-Settings → "Recent Deliveries" → Response 200 + `{"ok":true,"closed":"KAL-99"}`.

---

## Task 8: Conflict-Check Hook im Hauptrepo

**Files (im `kalkulai/kalkulai`-Repo, nicht in Team-OS):**
- Create: `.claude/hooks/conflict-check.js`
- Modify: `.claude/settings.json`

- [ ] **Step 1: Hook-Helper schreiben**

```javascript
// kalkulai/.claude/hooks/conflict-check.js
// Pre-tool-use Hook. Wird vor jedem Bash-Call gefeuert.
// Wenn Bash 'git checkout -b <branch>' enthält, prüft ob das Linear-Issue schon assigned ist.

const TEAM_OS_URL = process.env.KALKULAI_TEAM_OS_URL || 'https://kalkulai-team-os.vercel.app';
const LINEAR_ID_RE = /\b([a-z]{2,5}-\d{1,6})\b/i;

const input = require('fs').readFileSync(0, 'utf8');
let event;
try { event = JSON.parse(input); } catch { process.exit(0); }

const cmd = event?.tool_input?.command;
if (!cmd || typeof cmd !== 'string') process.exit(0);

const checkoutMatch = cmd.match(/git\s+checkout\s+-b\s+(\S+)/);
if (!checkoutMatch) process.exit(0);

const linearMatch = checkoutMatch[1].match(LINEAR_ID_RE);
if (!linearMatch) process.exit(0);

const linearId = linearMatch[1].toUpperCase();

(async () => {
  try {
    const res = await fetch(`${TEAM_OS_URL}/api/conflicts?linearId=${linearId}`);
    if (!res.ok) process.exit(0);  // fail-open

    const data = await res.json();
    if (data.branches && data.branches.length > 0) {
      const owners = data.branches
        .map((b) => `${b.name}${b.authorLogin ? ' (' + b.authorLogin + ')' : ''}`)
        .join(', ');
      console.error(`[conflict-check] ${linearId} hat bereits aktive Branches: ${owners}`);
      console.error(`[conflict-check] Issue assigned an: ${data.assignee?.name ?? 'niemand'}`);
      console.error(`[conflict-check] Trotzdem fortfahren? Wenn ja, ignoriere diese Warnung.`);
      // exit 0 = warning only, exit 2 = block — wir warnen nur
      process.exit(0);
    }
  } catch {
    process.exit(0);  // network errors = no block
  }
})();
```

- [ ] **Step 2: Hook in `kalkulai/.claude/settings.json` registrieren**

```jsonc
// kalkulai/.claude/settings.json — falls "hooks" schon existiert, das PreToolUse-Array MERGEN
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "node .claude/hooks/conflict-check.js" }
        ]
      }
    ]
  }
}
```

- [ ] **Step 3: Commit im Hauptrepo**
```bash
cd C:/kalkulai/kalkulai
git add .claude/hooks/conflict-check.js .claude/settings.json
git commit -m "feat(hooks): warn on git checkout for already-assigned linear issues"
```

- [ ] **Step 4: Verify** — In Claude Code: `git checkout -b kal-1-test`. Wenn `KAL-1` aktive Branches im Team-OS-API hat, erscheint die Warnung in stderr. Bei `git checkout -b nothing-special` passiert nichts.

---

## Task 9: vercel.json prüfen + Cron aktivieren

**Files:**
- Verify only: `vercel.json` (existiert seit Plan A)

- [ ] **Step 1: Inhalt prüfen** — sollte sein:
```json
{
  "crons": [
    { "path": "/api/briefing/send", "schedule": "0 6 * * *" }
  ]
}
```

- [ ] **Step 2: Nach Deploy von Task 5** → https://vercel.com/leons-projects-1a41e692/kalkulai-team-os/crons → Cron sollte als **"Active"** mit Schedule `0 6 * * *` (UTC) erscheinen.

> **Achtung Zeitzone:** Vercel-Crons laufen UTC. `0 6 * * *` UTC = 08:00 Berlin (Sommerzeit) bzw. 07:00 (Winterzeit). Wenn 06:00 Berlin gewünscht: `0 4 * * *` UTC im Sommer, `0 5 * * *` UTC im Winter — oder `0 5 * * *` ganzjährig (=06:00 winter / 07:00 sommer) als Kompromiss.

- [ ] **Step 3: Manueller Trigger zum Testen** — Vercel-Dashboard → Crons → Job → **"Run Now"**. Telegram sollte innerhalb von 30s kommen.

---

## Task 10: Smoke-Tests + Production-Verify

- [ ] **Step 1: Briefing-Endpoint lokal**
```powershell
$cron = (Get-Content .env.local | Select-String '^CRON_SECRET=').ToString().Split('=')[1]
curl -H "Authorization: Bearer $cron" http://localhost:3000/api/briefing/send | ConvertFrom-Json
# Telegram-Chat checken: Briefings angekommen?
```

- [ ] **Step 2: Webhook lokal mit ngrok** (optional für end-to-end Test ohne PR)
```bash
ngrok http 3000
# in GitHub-Webhook-Settings ngrok-URL temporär eintragen, Test-PR mergen, "Recent Deliveries" prüfen
```

- [ ] **Step 3: Conflict-Hook trockenlauf**
```bash
cd C:/kalkulai/kalkulai
echo '{"tool_input":{"command":"git checkout -b kal-1-test"}}' | node .claude/hooks/conflict-check.js
# Sollte stderr-Warnung zeigen wenn KAL-1 aktive Branches hat
```

- [ ] **Step 4: Production-Push**
```bash
cd C:/kalkulai/kalkulai-team-os && git push   # Team-OS auto-deploys
cd C:/kalkulai/kalkulai && git push           # Hauptrepo
```

- [ ] **Step 5: Vercel-Auth + Bypass für Webhook/Cron konfigurieren**

> **Vercel-Authentication blockt standardmäßig auch API-Routes.** Lösung in Vercel-Dashboard → **Deployment Protection → Protection Bypass for Automation → Add Secret** → diesen Token als Header senden:
> - **Cron-Job:** Vercel-Crons bypassen Auth automatisch wenn `CRON_SECRET` korrekt gesetzt ist (Vercel injectet `Authorization` selbst).
> - **GitHub-Webhook:** im GitHub-Webhook-Form unter "Headers" zusätzlich `x-vercel-protection-bypass: <bypass-token>` eintragen.

```powershell
# Auth-Wand verifizieren
curl -I https://kalkulai-team-os.vercel.app/dashboard
# erwartet: 401 oder Redirect

# Cron-Endpoint mit Secret + Bypass-Header
curl -H "Authorization: Bearer $CRON_SECRET" `
     -H "x-vercel-protection-bypass: $BYPASS_TOKEN" `
     https://kalkulai-team-os.vercel.app/api/briefing/send
# erwartet: 200 + summary
```

---

## Self-Review gegen Spec

| Spec-Requirement | Task |
|---|---|
| URL-Auth (Vercel Password Protect) | Task 1 |
| Telegram Morning Briefing | Tasks 3, 4, 5 |
| Vercel Cron 06:00 | Tasks 5, 9 |
| GitHub-Webhook → Linear Auto-Close | Tasks 6, 7 |
| Branch→Linear-ID Parser | Task 6 |
| HMAC-verify auf Webhook | Task 7 Step 1 |
| Claude-Code Conflict-Check Hook | Task 8 |
| Cross-Repo Setup (Hooks im Hauptrepo) | Task 8 |
| End-to-End Smoke-Tests | Task 10 |

---

## Phase 3 (offen, **nicht** in Plan B)

- **Echte User-Auth** (NextAuth + Supabase Auth, RLS-Policies pro Person) — Plan B nutzt Vercel-Password als Quick-Win, nicht Multi-User-Auth
- **`bugs_fixed` Tracking** (Linear-Label-basiert oder manueller Toggle)
- **Sales-Cold-Call-Logging-Form** (statt nur HubSpot-Mirror)
- **Slack-Bridge** falls Telegram nicht alle nutzen
- **Realtime-Updates** im Dashboard (Supabase Realtime auf `kpi_daily`)
- **Tests** (Vitest für lib/, Playwright für critical flows)

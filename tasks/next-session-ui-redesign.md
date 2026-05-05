# Next Session — UI Redesign Iteration

**Date prepared:** 2026-05-05
**Last live deploy:** `dpl_F7ND5t6KnMvARz9WNKGXuCcmk17f` (Production)
**Live URL:** https://kalkulai-team-os.vercel.app
**Project root:** `C:\kalkulai\kalkulai-team-os`
**Branch:** `master` (5 unpushed commits — only blocked by `lp-kai` lacking org write access; `gh auth` shows lp-kai)

---

## Mission for the next session

The user (Leon) has just looked at the current Bento/Glass UI live on his phone. He wants to **redesign the UI again** — this time using **21st-dev (Magic MCP)** for premium components. Approach:

1. **DO NOT start coding immediately.** First, **collect detailed feedback** from Leon on the current live version. Ask about specific pages, specific cards, what feels off, what should be denser/airier, mobile vs desktop priorities, etc.
2. **Then iterate per page**, never bulk-rewrite. After each meaningful change, ask Leon to reload the live URL (or local dev server) and react.
3. Use **`mcp__magic__*` tools** if they're loaded — verify with `ToolSearch query="21st_magic"`. If not loaded, the Magic MCP server is connected (`magic: npx -y @21st-dev/magic@latest`) but tools may not have surfaced. A fresh session restart usually loads them. If still missing, fall back to manual Tailwind/shadcn (works fine — current Bento was built that way).

---

## Current state — what's live right now

### Style language already established
- **Glass cards:** `rounded-2xl bg-card/70 backdrop-blur-xl ring-1 ring-foreground/5` + double-layer shadow (light + dark variants)
- **Entry animation:** `card-rise` keyframe (opacity + 8px translateY, 400ms ease)
- **KPI bars:** large tone-coded number (emerald/amber/rose by completion %), animated `kpi-fill` keyframe (scaleX 0→1, 900ms cubic-bezier), CSS-variable for dynamic width (`--kpi-pct`)
- **Background:** dual radial-gradient in `oklch` (light + dark themed), fixed, behind everything
- **Nav:** sticky glass with `backdrop-blur-xl`, `max-w-6xl` content width
- **Touch targets:** all interactive elements ≥44px (TaskList rows, SalesLogger buttons, Settings inputs)
- **Avatars:** initial-based (`initials(name)`), role-tinted ring (dev=sky, sales=fuchsia, founder=amber)
- **Typography:** `tracking-tight` for headings, `tabular-nums` for all numbers, `uppercase tracking-wider text-muted-foreground` for section labels

### Pages already refactored
| Page | File | What it has |
|---|---|---|
| Dashboard | `app/dashboard/page.tsx` | 6-col bento (Hero 6 / Tasks 4 / Meetings 2 / KPIs 3 / Sales-or-Insights 3) |
| Team | `app/dashboard/team/page.tsx` | Header + Branches (full-width) + per-member cards (3-col each) with role-tinted avatars |
| Settings | `app/settings/page.tsx` | Header + KPI-targets (3) + Calendar-connect (3) + Connection-status grid (full-width) with avatar rings showing connection ratio |
| Layout | `app/layout.tsx` | Sticky glass nav, oklch radial-gradient backdrop |
| Globals | `app/globals.css` | Two keyframes: `kpi-fill`, `card-rise` |

### Components touched
- `components/KpiBar.tsx` — large number + animated bar
- `components/SalesLogger.tsx` — 68px tap targets, success-flash ring, pending pulse
- `components/TaskList.tsx` — ≥44px label rows, larger checkbox

### Components NOT touched (still original)
- `components/MeetingList.tsx` — minimal text-only, may need polish
- `components/MemberSwitcher.tsx` — shadcn Select wrapper
- `components/TeamBranchView.tsx` — branch list with author initials, slightly old-school styling

---

## Tech notes

- Next.js 16.2.4 (Turbopack), App Router, React Server Components
- TypeScript strict, no `any`
- Tailwind v4 + `tw-animate-css` + `shadcn/tailwind.css`
- Theme tokens in `oklch()`, CSS variables in `app/globals.css`
- date-fns + de locale for all dates
- Supabase client now lazy-init via Proxy (`lib/supabase.ts`) — preserves API for 12 callers
- Tests: 76/76 vitest green; `npx tsc --noEmit` clean

### Build/deploy commands
```bash
npm run dev          # http://localhost:3000
npx tsc --noEmit     # type check
npx vitest run       # tests
vercel deploy        # preview
vercel deploy --prod # production (explicit user approval required)
```

### Vercel deploy gotcha — already solved, document for awareness
- "Git Author Verification" is enabled on this Vercel project
- Commits MUST be authored by `info@kalkulai.de` (verified on the GitHub account with org access)
- Local repo `git config user.email` is set to `info@kalkulai.de` — global is `leon.prothmann@campus.lmu.de` (uni)
- If a deploy fails with "commit email could not be matched to a GitHub account", check `git log --pretty=format:"%h %ae" -3`

---

## What to ask Leon FIRST (before any code)

Open the conversation with something like:
> "Production ist live unter https://kalkulai-team-os.vercel.app — bevor wir am Design weiterarbeiten: geh mit dem Handy einmal alle drei Seiten durch (`/dashboard`, `/dashboard/team`, `/settings`). Ich brauche von dir:
> 1. Pro Page: was funktioniert visuell, was fühlt sich schwach an?
> 2. Welche Page hat höchste Priorität für Redesign?
> 3. Style-Richtung: bleiben wir bei Glass/Bento oder komplett anders denken (z.B. minimal flat, brutalist, neumorphic)?
> 4. Hast du konkrete Inspiration (URLs, Screenshots, Apps die du gut findest)?
> 5. Touch-Feeling auf dem Handy ok oder müssen Targets noch größer/Spacing anders?"

**DO NOT** propose components yet. Wait for his answers. He explicitly said: *"feedback viel einholen soll zu der neusten version wenn ich sie live sehe und dann schauen wie wir im detail sachen überarbeiten"*

---

## Open items still in handoff (from previous session, not blocking redesign)

From `tasks/handoff.md`:
- `lp-kai` needs Collaborator access to `Kalkulai` org for `git push` to work (Vercel deploys via webhook are the long-term clean path; CLI direct deploys work but are fragile)
- Token rotation needed: Vercel-Bypass, Supabase PAT, CRON_SECRET, GITHUB_WEBHOOK_SECRET (all exposed in chat history)
- Felix + Paul Calendar-OAuth-Connect (after their workspace accounts exist)
- Future: weekly KPI delta, SalesLogger undo, real auth (replace `NEXT_PUBLIC_DASHBOARD_API_SECRET`), Notion-Insight inline-action

---

## How to start the next chat

Recommend Leon types something like:

```
Lies tasks/next-session-ui-redesign.md, schau dir die aktuellen Files an
(app/dashboard/page.tsx, app/settings/page.tsx, app/dashboard/team/page.tsx,
components/KpiBar.tsx, app/globals.css, app/layout.tsx), prüfe ob mcp__magic__*
Tools verfügbar sind (ToolSearch query="21st_magic"), und stelle MIR die
Feedback-Fragen aus dem Doc bevor du irgendwas änderst.
```

That ensures the next Claude (a) has full context, (b) doesn't immediately start coding, (c) verifies Magic-MCP before assuming it's available.

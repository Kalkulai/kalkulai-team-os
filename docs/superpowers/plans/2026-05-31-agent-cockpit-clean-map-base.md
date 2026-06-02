# Agent Cockpit Clean Map Base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved clean Agent Cockpit map base: active repo nodes, neutral draggable terminal nodes with repo-colored runes, minimal right inspector, and split Start Run entry points.

**Architecture:** Keep Team-OS as the control plane and the local runner as the terminal host. The graph view model decides what belongs on the map; React Flow renders repo/terminal nodes; AgentCockpit owns runner polling, selection, launch flows, and inspector state. This base deliberately avoids Paperclip/Conductor integration until the cockpit semantics are stable.

**Tech Stack:** Next.js App Router, React 19, TypeScript, React Flow (`@xyflow/react`), xterm.js + fit addon, Vitest, ESLint, local Node runner.

---

## Scope

This plan implements the base of Phase 3 from:

`C:\Kalkulai\kalkulai-team-os\docs\superpowers\specs\2026-05-31-agent-cockpit-clean-map-design.md`

Included:

- repo nodes only for active/pinned repos
- no project nodes
- terminal node redesign with neutral terminal and repo-colored rune
- no visible Linear IDs in the main map
- agent icon and status dot in terminal chrome
- subagent placeholders as attached figures below terminal when metadata exists
- right inspector opened by terminal click, closed by empty canvas click
- inspector structure: progress, follow-up, changes, environment, subagents, done-pending actions
- `Start Run` popover with `Aus Task starten` and `Quick Terminal`
- runner metadata fields for `work_goal`, `run_label`, `queue`, `subagents`, `plan_steps`, `change_summary`

Excluded:

- Paperclip/Conductor research or integration
- remote runners
- automatic subagent process-tree detection
- full drag-and-drop queue implementation
- full diff viewer
- fake progress percentages

---

## File Structure

### Modify

- `C:\Kalkulai\kalkulai-team-os\types\index.ts`
  - Add optional runner metadata fields used by the clean map and inspector.

- `C:\Kalkulai\kalkulai-team-os\lib\agent-workspace-graph.ts`
  - Replace `project` graph nodes with `repo` graph nodes.
  - Compute human labels, repo colors, terminal run labels, active repo counts.

- `C:\Kalkulai\kalkulai-team-os\tests\agent-workspace-graph.test.ts`
  - Update tests from "project nodes" to "repo nodes".
  - Add tests for no visible IDs and active-only repo nodes.

- `C:\Kalkulai\kalkulai-team-os\agent-runner\server.mjs`
  - Persist and patch new metadata fields without changing existing endpoints.

- `C:\Kalkulai\kalkulai-team-os\components\agents\AgentTerminalMap.tsx`
  - Render `repo` and clean `terminal` node types.
  - Close inspector on pane click.
  - Keep xterm and resize behavior.

- `C:\Kalkulai\kalkulai-team-os\components\agents\AgentCockpit.tsx`
  - Split start behavior into popover + Task Start + Quick Terminal.
  - Replace current inspector content with minimal clean inspector.
  - Pass selection close/open callbacks to map.

- `C:\Kalkulai\kalkulai-team-os\app\globals.css`
  - Replace old map/project/terminal node styles with clean map styles.
  - Keep existing non-agent dashboard styles untouched.

### Create

- `C:\Kalkulai\kalkulai-team-os\components\agents\AgentRunInspector.tsx`
  - Focused right-side inspector for one selected runner session.

- `C:\Kalkulai\kalkulai-team-os\components\agents\AgentStartRunMenu.tsx`
  - Small `Start Run` popover with two choices.

- `C:\Kalkulai\kalkulai-team-os\tests\agent-run-labels.test.ts`
  - Tests for label helpers if extracted from `agent-workspace-graph.ts`.

---

## Task 1: Extend Runner Metadata Types

**Files:**

- Modify: `C:\Kalkulai\kalkulai-team-os\types\index.ts`
- Test: `C:\Kalkulai\kalkulai-team-os\tests\agent-workspace-graph.test.ts`

- [ ] **Step 1: Add metadata types**

In `types/index.ts`, add these interfaces near `AgentSessionLayout`:

```ts
export type AgentRunStepStatus = 'todo' | 'active' | 'done' | 'blocked';
export type AgentSubagentStatus = 'active' | 'idle' | 'blocked' | 'done';

export interface AgentRunPlanStep {
  id: string;
  title: string;
  status: AgentRunStepStatus;
}

export interface AgentRunChangeSummary {
  additions?: number | null;
  deletions?: number | null;
  files?: number | null;
}

export interface AgentSubagentSummary {
  id: string;
  name: string;
  status: AgentSubagentStatus;
  runtime?: AgentRuntime | null;
}

export interface AgentRunQueueItem {
  id: string;
  title: string;
  repo_key?: string | null;
  kind?: 'code' | 'ops' | 'research' | 'sales' | 'general';
  status?: 'queued' | 'active' | 'review' | 'done' | 'blocked';
}
```

- [ ] **Step 2: Extend `AgentRunnerSession`**

Add optional fields to `AgentRunnerSession`:

```ts
  work_goal?: string | null;
  run_label?: string | null;
  pinned?: boolean | null;
  queue?: AgentRunQueueItem[] | null;
  plan_steps?: AgentRunPlanStep[] | null;
  change_summary?: AgentRunChangeSummary | null;
  subagents?: AgentSubagentSummary[] | null;
  done_pending?: boolean | null;
```

- [ ] **Step 3: Run typecheck through the graph test**

Run:

```powershell
npm run test -- agent-workspace-graph.test.ts
```

Expected:

```text
Test Files 1 passed
```

- [ ] **Step 4: Commit**

```powershell
git add types/index.ts tests/agent-workspace-graph.test.ts
git commit -m "feat: add agent run metadata types"
```

---

## Task 2: Rebuild Graph ViewModel Around Repos

**Files:**

- Modify: `C:\Kalkulai\kalkulai-team-os\lib\agent-workspace-graph.ts`
- Modify: `C:\Kalkulai\kalkulai-team-os\tests\agent-workspace-graph.test.ts`

- [ ] **Step 1: Update graph node types**

Replace the `AgentWorkspaceProjectNode` union branch with a repo node:

```ts
export type AgentWorkspaceNode =
  | AgentWorkspaceRepoNode
  | AgentWorkspaceTerminalNode;

export interface AgentWorkspaceRepoNode {
  id: string;
  type: 'repo';
  position: { x: number; y: number };
  data: {
    label: string;
    repoKey: string;
    repoLabel: string;
    repoPath: string;
    color: string;
    sessionCount: number;
    pinned: boolean;
  };
}
```

Extend terminal node data:

```ts
    workGoal: string;
    runLabel: string;
    displayTitle: string;
    repoColor: string;
```

- [ ] **Step 2: Add repo color defaults**

Add this helper in `agent-workspace-graph.ts`:

```ts
const REPO_COLORS: Record<string, string> = {
  'team-os': '#5B8CFF',
  operations: '#2DD4BF',
  '2nd-brain': '#A78BFA',
  hermes: '#F2B84B',
  kalkulai: '#38BDF8',
  marketplace: '#FB7185',
};

function colorForRepo(repo: { label: string; path: string; keywords?: string[] }) {
  const key = keyForRepo(repo);
  return REPO_COLORS[key] ?? '#94A3B8';
}

function keyForRepo(repo: { label: string; path: string; keywords?: string[] }) {
  const text = `${repo.label} ${repo.path} ${(repo.keywords ?? []).join(' ')}`.toLowerCase();
  if (text.includes('team-os')) return 'team-os';
  if (text.includes('operations')) return 'operations';
  if (text.includes('2nd-brain') || text.includes('2nd brain')) return '2nd-brain';
  if (text.includes('hermes')) return 'hermes';
  if (text.includes('kalkulai') && !text.includes('team-os')) return 'kalkulai';
  if (text.includes('marketplace')) return 'marketplace';
  return normalizePath(repo.path).split('\\').pop() ?? repo.label.toLowerCase();
}
```

- [ ] **Step 3: Add label helpers**

Add these helpers:

```ts
function stripVisibleIds(value: string) {
  return value
    .replace(/\b[A-Z]{2,}-\d+\b\s*[-:·]?\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function workGoalForSession(session: AgentRunnerSession, workstream: AgentWorkstream | null, repoLabel: string) {
  return stripVisibleIds(session.work_goal ?? workstream?.projectLabel ?? session.workstream ?? repoLabel ?? 'Run') || 'Run';
}

function runLabelForSession(session: AgentRunnerSession, workstream: AgentWorkstream | null) {
  return stripVisibleIds(session.run_label ?? workstream?.title ?? session.title ?? 'leer') || 'leer';
}
```

- [ ] **Step 4: Replace project buckets with repo buckets**

Inside `buildAgentWorkspaceGraph`, rename `projectBuckets` to `repoBuckets` and create only repo nodes for active sessions:

```ts
const repoBuckets = new Map<string, {
  repoKey: string;
  repoLabel: string;
  repoPath: string;
  color: string;
  sessions: AgentRunnerSession[];
  pinned: boolean;
}>();
```

For each active session:

```ts
const repo = repoForSession(session, workstream);
const repoKey = keyForRepo(repo);
const color = colorForRepo(repo);
const bucket = repoBuckets.get(repo.path) ?? {
  repoKey,
  repoLabel: repo.label,
  repoPath: repo.path,
  color,
  sessions: [],
  pinned: false,
};
bucket.sessions.push(session);
bucket.pinned = bucket.pinned || Boolean(session.pinned);
repoBuckets.set(repo.path, bucket);
```

- [ ] **Step 5: Create repo nodes**

Replace `projectNodes` with:

```ts
const repoOrder = [...repoBuckets.values()].sort((a, b) => a.repoLabel.localeCompare(b.repoLabel));
const repoNodes: AgentWorkspaceRepoNode[] = repoOrder.map((bucket, index) => ({
  id: repoNodeId(bucket.repoPath),
  type: 'repo',
  position: { x: 56 + index * 190, y: 56 },
  data: {
    label: `${bucket.repoLabel} · ${bucket.sessions.length}`,
    repoKey: bucket.repoKey,
    repoLabel: bucket.repoLabel,
    repoPath: bucket.repoPath,
    color: bucket.color,
    sessionCount: bucket.sessions.length,
    pinned: bucket.pinned,
  },
}));
```

- [ ] **Step 6: Update terminal nodes and edges**

Terminal node data should include:

```ts
const workGoal = workGoalForSession(session, workstream, repo.label);
const runLabel = runLabelForSession(session, workstream);
```

Edge source should be:

```ts
source: repoNodeId(node.data.repoPath),
target: node.id,
label: undefined,
```

Return:

```ts
nodes: [...repoNodes, ...terminalNodes],
```

- [ ] **Step 7: Rename node id helper**

Replace `projectNodeId` with:

```ts
export function repoNodeId(repoPath: string): string {
  return `repo:${normalizePath(repoPath)}`;
}
```

- [ ] **Step 8: Update tests**

Replace the project-node test with:

```ts
it('creates repo nodes only for repos with active terminal sessions', () => {
  const graph = buildAgentWorkspaceGraph({
    runnerSessions: [runnerSession()],
    workstreams: [workstream()],
    projects: [project()],
  });

  const repoNodes = graph.nodes.filter((node) => node.type === 'repo');
  expect(repoNodes).toHaveLength(1);
  expect(repoNodes[0].data.label).toBe('Team OS · 1');
  expect(repoNodes[0].data.sessionCount).toBe(1);
  expect(graph.edges).toEqual([
    expect.objectContaining({
      source: repoNodes[0].id,
      target: 'terminal:runner-1',
    }),
  ]);
});
```

Add ID stripping test:

```ts
it('removes technical issue ids from terminal display labels', () => {
  const graph = buildAgentWorkspaceGraph({
    runnerSessions: [runnerSession({ title: 'KAL-153 - Terminal Map cleanup' })],
    workstreams: [workstream({ title: 'KAL-153 - Terminal Map cleanup', projectLabel: 'Agent Cockpit' })],
    projects: [project()],
  });

  const terminal = graph.nodes.find((node) => node.type === 'terminal');
  expect(terminal?.data).toEqual(expect.objectContaining({
    workGoal: 'Agent Cockpit',
    runLabel: 'Terminal Map cleanup',
    displayTitle: 'Agent Cockpit · Terminal Map cleanup',
  }));
});
```

- [ ] **Step 9: Run tests**

```powershell
npm run test -- agent-workspace-graph.test.ts
```

Expected:

```text
Test Files 1 passed
```

- [ ] **Step 10: Commit**

```powershell
git add lib/agent-workspace-graph.ts tests/agent-workspace-graph.test.ts
git commit -m "feat: model agent cockpit map by active repos"
```

---

## Task 3: Persist Clean Map Metadata In Runner

**Files:**

- Modify: `C:\Kalkulai\kalkulai-team-os\agent-runner\server.mjs`

- [ ] **Step 1: Add metadata to `createSession`**

In `createSession`, add fields to the session object:

```js
    work_goal: stringOrNull(payload.work_goal),
    run_label: stringOrNull(payload.run_label),
    pinned: Boolean(payload.pinned),
    queue: arrayOrNull(payload.queue),
    plan_steps: arrayOrNull(payload.plan_steps),
    change_summary: objectOrNull(payload.change_summary),
    subagents: arrayOrNull(payload.subagents),
    done_pending: Boolean(payload.done_pending),
```

- [ ] **Step 2: Add patch support**

In `buildSessionPatch`, allow:

```js
  if ('work_goal' in payload) patch.work_goal = stringOrNull(payload.work_goal);
  if ('run_label' in payload) patch.run_label = stringOrNull(payload.run_label);
  if ('pinned' in payload) patch.pinned = Boolean(payload.pinned);
  if ('queue' in payload) patch.queue = arrayOrNull(payload.queue);
  if ('plan_steps' in payload) patch.plan_steps = arrayOrNull(payload.plan_steps);
  if ('change_summary' in payload) patch.change_summary = objectOrNull(payload.change_summary);
  if ('subagents' in payload) patch.subagents = arrayOrNull(payload.subagents);
  if ('done_pending' in payload) patch.done_pending = Boolean(payload.done_pending);
```

- [ ] **Step 3: Add helper functions**

Near `stringOrNull`, add:

```js
function arrayOrNull(value) {
  return Array.isArray(value) ? value : null;
}

function objectOrNull(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
```

- [ ] **Step 4: Include metadata in `publicSession`**

Return these fields:

```js
    work_goal: session.work_goal ?? null,
    run_label: session.run_label ?? null,
    pinned: Boolean(session.pinned),
    queue: session.queue ?? null,
    plan_steps: session.plan_steps ?? null,
    change_summary: session.change_summary ?? null,
    subagents: session.subagents ?? null,
    done_pending: Boolean(session.done_pending),
```

- [ ] **Step 5: Keep Team-OS API compatibility**

Do not change `/api/claude/active-task`. This runner metadata is local-runner-first and must not break existing Claude session mirrors.

- [ ] **Step 6: Manual smoke test runner metadata**

Start or restart runner:

```powershell
npm run agent-runner
```

In another terminal:

```powershell
$body = @{
  runtime = 'shell'
  cwd = 'C:\Kalkulai\kalkulai-team-os'
  title = 'Clean map metadata smoke'
  work_goal = 'Agent Cockpit'
  run_label = 'Metadata smoke'
  repo_key = 'team-os'
  plan_steps = @(@{ id = 's1'; title = 'Check metadata'; status = 'active' })
} | ConvertTo-Json -Depth 6
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3217/sessions' -ContentType 'application/json' -Body $body
```

Expected:

```text
session.work_goal = Agent Cockpit
session.run_label = Metadata smoke
session.plan_steps[0].title = Check metadata
```

- [ ] **Step 7: Exit smoke session**

Send:

```powershell
$id = '<session id from previous response>'
$body = @{ data = "exit`r`n" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:3217/sessions/$id/input" -ContentType 'application/json' -Body $body
```

Expected:

```text
/sessions returns no active smoke session
/sessions?include=archived contains the smoke session
```

- [ ] **Step 8: Commit**

```powershell
git add agent-runner/server.mjs
git commit -m "feat: persist clean map runner metadata"
```

---

## Task 4: Redesign React Flow Nodes

**Files:**

- Modify: `C:\Kalkulai\kalkulai-team-os\components\agents\AgentTerminalMap.tsx`
- Modify: `C:\Kalkulai\kalkulai-team-os\app\globals.css`

- [ ] **Step 1: Rename node data types**

In `AgentTerminalMap.tsx`, change:

```ts
type FlowNode = Node<RepoNodeData | TerminalNodeData, 'repo' | 'terminal'>;
```

Replace `ProjectNodeData` with:

```ts
interface RepoNodeData extends Record<string, unknown> {
  label: string;
  repoKey: string;
  repoLabel: string;
  repoPath: string;
  color: string;
  sessionCount: number;
  pinned: boolean;
}
```

- [ ] **Step 2: Map repo nodes**

In the `nodes` memo, replace the project branch:

```ts
if (node.type === 'repo') {
  return {
    id: node.id,
    type: 'repo',
    position: node.position,
    data: node.data,
    draggable: true,
    selectable: false,
  };
}
```

- [ ] **Step 3: Use repo node type**

Change:

```ts
const nodeTypes = useMemo(() => ({
  repo: RepoNode,
  terminal: TerminalNode,
}), []);
```

- [ ] **Step 4: Replace `ProjectNode` with `RepoNode`**

Use:

```tsx
const RepoNode = memo(function RepoNode({ data }: NodeProps<Node<RepoNodeData, 'repo'>>) {
  return (
    <div
      className="agent-repo-node"
      style={{ '--agent-repo-color': data.color } as CSSProperties}
      title={data.repoPath}
    >
      <Handle type="source" position={Position.Bottom} />
      <span className="agent-repo-node-dot" />
      <strong>{data.label}</strong>
    </div>
  );
});
```

- [ ] **Step 5: Update terminal header markup**

Replace terminal node header with:

```tsx
<div
  className="agent-terminal-rune agent-terminal-node-drag-handle"
  style={{ '--agent-repo-color': data.repoColor } as CSSProperties}
>
  <span>{data.workGoal}</span>
  <small>{data.runLabel}</small>
</div>
<div className="agent-terminal-mac-head agent-terminal-node-drag-handle">
  <span className="agent-window-dots" aria-hidden>
    <i /><i /><i />
  </span>
  <span className="agent-terminal-spacer" />
  <span className={`agent-status-dot ${data.session.done_pending ? 'done-pending' : data.session.status}`} />
  <span className={`agent-runtime-icon ${data.session.runtime}`} title={runtimeLabel(data.session.runtime)}>
    {runtimeGlyph(data.session.runtime)}
  </span>
</div>
```

- [ ] **Step 6: Add runtime glyph helper**

```ts
function runtimeGlyph(runtime: AgentRuntime) {
  if (runtime === 'claude') return 'Cl';
  if (runtime === 'codex') return 'Cx';
  if (runtime === 'hermes') return 'H';
  return '$';
}
```

- [ ] **Step 7: Render subagents below terminal**

Below the xterm surface:

```tsx
{Boolean(data.session.subagents?.length) && (
  <div className="agent-terminal-subagents" style={{ '--agent-repo-color': data.repoColor } as CSSProperties}>
    {data.session.subagents?.map((subagent) => (
      <span key={subagent.id} className={`agent-subagent-figure ${subagent.status}`} title={`${subagent.name} · ${subagent.status}`} />
    ))}
  </div>
)}
```

- [ ] **Step 8: Close inspector on empty canvas click**

Add prop to `AgentTerminalMap`:

```ts
onClearSelection: () => void;
```

Pass to `ReactFlow`:

```tsx
onPaneClick={onClearSelection}
```

- [ ] **Step 9: Replace CSS**

In `globals.css`, add clean map styles after current `.agent-flow-shell` block:

```css
.agent-repo-node {
  --agent-repo-color: #5b8cff;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 118px;
  height: 34px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--agent-repo-color) 55%, transparent);
  background: rgba(8, 12, 24, .88);
  color: var(--ink-1);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--agent-repo-color) 14%, transparent);
}
.agent-repo-node-dot {
  width: 8px;
  height: 8px;
  border-radius: 99px;
  background: var(--agent-repo-color);
  box-shadow: 0 0 12px var(--agent-repo-color);
}
.agent-repo-node strong {
  font-size: 12px;
  font-weight: 760;
}
.agent-terminal-node {
  position: relative;
  overflow: visible;
  border: 1px solid rgba(148, 163, 184, .18);
  border-radius: 14px;
  background: #050813;
  box-shadow: 0 18px 44px rgba(0, 0, 0, .34);
}
.agent-terminal-rune {
  --agent-repo-color: #5b8cff;
  position: absolute;
  left: 18px;
  top: -18px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100% - 78px);
  height: 34px;
  padding: 0 12px;
  border-radius: 15px 15px 15px 6px;
  border: 1px solid color-mix(in srgb, var(--agent-repo-color) 58%, transparent);
  background: color-mix(in srgb, var(--agent-repo-color) 18%, #080c18);
  color: #f8fafc;
}
.agent-terminal-rune span,
.agent-terminal-rune small {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.agent-terminal-rune span {
  font-size: 12px;
  font-weight: 780;
}
.agent-terminal-rune small {
  color: color-mix(in srgb, var(--agent-repo-color) 58%, white);
  font-size: 11px;
  font-weight: 700;
}
.agent-terminal-mac-head {
  height: 38px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border-bottom: 1px solid rgba(148, 163, 184, .12);
  background: rgba(15, 23, 42, .42);
}
.agent-window-dots {
  display: inline-flex;
  gap: 6px;
}
.agent-window-dots i {
  width: 9px;
  height: 9px;
  border-radius: 99px;
  background: rgba(148, 163, 184, .42);
}
.agent-terminal-spacer { flex: 1; }
.agent-runtime-icon {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(255,255,255,.06);
  font-size: 10px;
  font-weight: 850;
}
.agent-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 99px;
  background: #64748b;
}
.agent-status-dot.running { background: #22c55e; box-shadow: 0 0 12px rgba(34,197,94,.6); }
.agent-status-dot.review { background: #60a5fa; box-shadow: 0 0 12px rgba(96,165,250,.55); }
.agent-status-dot.done-pending { background: #facc15; box-shadow: 0 0 12px rgba(250,204,21,.55); }
.agent-status-dot.blocked,
.agent-status-dot.failed { background: #fb7185; box-shadow: 0 0 12px rgba(251,113,133,.55); }
.agent-terminal-subagents {
  position: absolute;
  left: 24px;
  bottom: -30px;
  display: flex;
  gap: 12px;
}
.agent-subagent-figure {
  width: 18px;
  height: 24px;
  position: relative;
}
.agent-subagent-figure::before {
  content: "";
  position: absolute;
  left: 5px;
  top: 0;
  width: 8px;
  height: 8px;
  border-radius: 99px;
  background: var(--agent-repo-color);
}
.agent-subagent-figure::after {
  content: "";
  position: absolute;
  left: 3px;
  bottom: 0;
  width: 12px;
  height: 13px;
  border-radius: 5px 5px 7px 7px;
  border: 1px solid color-mix(in srgb, var(--agent-repo-color) 48%, transparent);
  background: color-mix(in srgb, var(--agent-repo-color) 18%, rgba(15,23,42,.9));
}
.agent-subagent-figure.idle { opacity: .48; }
.agent-subagent-figure.blocked::before { background: #fb7185; }
```

- [ ] **Step 10: Run lint on map file**

```powershell
npx eslint components/agents/AgentTerminalMap.tsx
```

Expected:

```text
no output and exit code 0
```

- [ ] **Step 11: Commit**

```powershell
git add components/agents/AgentTerminalMap.tsx app/globals.css
git commit -m "feat: redesign agent cockpit terminal map nodes"
```

---

## Task 5: Add Minimal Run Inspector

**Files:**

- Create: `C:\Kalkulai\kalkulai-team-os\components\agents\AgentRunInspector.tsx`
- Modify: `C:\Kalkulai\kalkulai-team-os\components\agents\AgentCockpit.tsx`
- Modify: `C:\Kalkulai\kalkulai-team-os\app\globals.css`

- [ ] **Step 1: Create `AgentRunInspector.tsx`**

Create component:

```tsx
'use client';

import { GitBranch, Monitor, X } from 'lucide-react';
import type { AgentRunnerSession } from '@/types';
import type { AgentProjectWorkstream, AgentWorkstream } from '@/lib/agent-workstreams';

export function AgentRunInspector({
  session,
  workstream,
  projectGroup,
  onClose,
}: {
  session: AgentRunnerSession;
  workstream: AgentWorkstream | null;
  projectGroup: { items: AgentWorkstream[] } | null;
  onClose: () => void;
}) {
  const steps = session.plan_steps?.length
    ? session.plan_steps
    : fallbackSteps(workstream);
  const currentIndex = projectGroup?.items.findIndex((item) => item.id === workstream?.id) ?? -1;
  const followUp = currentIndex >= 0 ? projectGroup?.items.slice(currentIndex + 1).find((item) => item.stage !== 'done') : null;
  const changes = session.change_summary;
  const subagents = session.subagents ?? [];

  return (
    <aside className="agent-run-inspector glass card-rise">
      <div className="agent-run-inspector-head">
        <div>
          <h2>{displayGoal(session, workstream)}</h2>
          <p>{displayRunLabel(session, workstream)}</p>
        </div>
        <button type="button" className="agent-icon-button" onClick={onClose} title="Inspector schliessen">
          <X size={15} aria-hidden />
        </button>
      </div>

      <section className="agent-run-section">
        <span>Fortschritt</span>
        <div className="agent-run-steps">
          {steps.map((step) => (
            <div key={step.id} className={`agent-run-step ${step.status}`}>
              <i />
              <p>{step.title}</p>
            </div>
          ))}
        </div>
      </section>

      {followUp && (
        <section className="agent-run-section">
          <span>Danach</span>
          <p className="agent-run-followup">{stripVisibleIds(followUp.title)}</p>
        </section>
      )}

      {changes && (
        <section className="agent-run-section">
          <span>Aenderungen</span>
          <div className="agent-run-changes">
            <strong className="plus">+{changes.additions ?? 0}</strong>
            <strong className="minus">-{changes.deletions ?? 0}</strong>
            <small>{changes.files ?? 0} Dateien</small>
          </div>
        </section>
      )}

      <section className="agent-run-section">
        <span>Umgebung</span>
        <div className="agent-run-env">
          <p><Monitor size={14} aria-hidden />{workstream?.repoLabel ?? session.repo_key ?? compactPath(session.cwd)}</p>
          <p><GitBranch size={14} aria-hidden />{session.branch ?? 'Branch nicht gesetzt'}</p>
          <p>{compactPath(session.worktree_path ?? session.cwd)}</p>
        </div>
      </section>

      {subagents.length > 0 && (
        <section className="agent-run-section">
          <span>Subagents</span>
          <div className="agent-run-subagents">
            {subagents.map((subagent) => (
              <p key={subagent.id}>
                <i className={subagent.status} />
                <strong>{subagent.name}</strong>
                <small>{subagent.status}</small>
              </p>
            ))}
          </div>
        </section>
      )}

      {session.done_pending && (
        <section className="agent-run-done-card">
          <strong>Task fertig?</strong>
          <p>Entscheide, ob der Run weiterarbeitet oder geschlossen wird.</p>
          <div>
            <button type="button">Done bestaetigen</button>
            <button type="button">Weiterarbeiten</button>
            <button type="button">Session schliessen</button>
          </div>
        </section>
      )}
    </aside>
  );
}

function fallbackSteps(workstream: AgentWorkstream | null) {
  if (!workstream) return [];
  return [{ id: workstream.id, title: stripVisibleIds(workstream.title), status: 'active' as const }];
}

function displayGoal(session: AgentRunnerSession, workstream: AgentWorkstream | null) {
  return stripVisibleIds(session.work_goal ?? workstream?.projectLabel ?? session.workstream ?? 'Run');
}

function displayRunLabel(session: AgentRunnerSession, workstream: AgentWorkstream | null) {
  return stripVisibleIds(session.run_label ?? workstream?.title ?? session.title ?? 'leer');
}

function stripVisibleIds(value: string) {
  return value.replace(/\b[A-Z]{2,}-\d+\b\s*[-:·]?\s*/g, '').replace(/\s+/g, ' ').trim();
}

function compactPath(path?: string | null) {
  if (!path) return 'Kein Worktree';
  return path.replace(/^C:\\Kalkulai\\/i, '');
}
```

- [ ] **Step 2: Wire inspector in `AgentCockpit.tsx`**

Import:

```ts
import { AgentRunInspector } from '@/components/agents/AgentRunInspector';
```

Replace the old `ContextPanel` render with:

```tsx
{contextPanelOpen && selectedRunnerSession && (
  <AgentRunInspector
    session={selectedRunnerSession}
    workstream={selectedWorkstream}
    projectGroup={selectedProjectTaskGroup}
    onClose={() => {
      setContextPanelOpen(false);
      setSelectedSessionId('');
    }}
  />
)}
```

- [ ] **Step 3: Clear selection on canvas click**

Pass to `AgentTerminalMap`:

```tsx
onClearSelection={() => {
  setContextPanelOpen(false);
  setSelectedSessionId('');
}}
```

- [ ] **Step 4: Add inspector CSS**

Add:

```css
.agent-run-inspector {
  padding: 16px;
  min-width: 310px;
  max-width: 360px;
  overflow: auto;
}
.agent-run-inspector-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  justify-content: space-between;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line-1);
}
.agent-run-inspector-head h2 {
  font-size: 15px;
  font-weight: 720;
  color: var(--ink-1);
}
.agent-run-inspector-head p {
  margin-top: 3px;
  font-size: 12px;
  color: var(--ink-3);
}
.agent-run-section {
  padding: 14px 0;
  border-bottom: 1px solid var(--line-1);
}
.agent-run-section > span {
  display: block;
  margin-bottom: 9px;
  color: var(--ink-3);
  font-size: 11px;
  font-weight: 760;
  text-transform: uppercase;
  letter-spacing: .08em;
}
.agent-run-step {
  display: grid;
  grid-template-columns: 16px 1fr;
  gap: 10px;
  align-items: start;
  margin-bottom: 8px;
  color: var(--ink-2);
}
.agent-run-step i {
  width: 13px;
  height: 13px;
  margin-top: 3px;
  border-radius: 99px;
  border: 1px solid var(--ink-3);
}
.agent-run-step.active i { border-color: #60a5fa; background: #60a5fa; }
.agent-run-step.done i { border-color: #22c55e; background: #22c55e; }
.agent-run-step.blocked i { border-color: #fb7185; background: #fb7185; }
.agent-run-followup {
  color: var(--ink-1);
  font-size: 13px;
}
.agent-run-changes {
  display: flex;
  gap: 10px;
  align-items: baseline;
}
.agent-run-changes .plus { color: #22c55e; }
.agent-run-changes .minus { color: #fb7185; }
.agent-run-changes small { color: var(--ink-3); }
.agent-run-env p,
.agent-run-subagents p {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 7px 0;
  color: var(--ink-2);
  font-size: 13px;
}
.agent-run-subagents i {
  width: 8px;
  height: 8px;
  border-radius: 99px;
  background: #64748b;
}
.agent-run-subagents i.active { background: #22c55e; }
.agent-run-subagents i.blocked { background: #fb7185; }
.agent-run-done-card {
  margin-top: 14px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(250, 204, 21, .28);
  background: rgba(250, 204, 21, .08);
}
```

- [ ] **Step 5: Lint**

```powershell
npx eslint components/agents/AgentRunInspector.tsx components/agents/AgentCockpit.tsx
```

Expected exit code 0.

- [ ] **Step 6: Commit**

```powershell
git add components/agents/AgentRunInspector.tsx components/agents/AgentCockpit.tsx app/globals.css
git commit -m "feat: add minimal agent run inspector"
```

---

## Task 6: Split Start Run Entry Points

**Files:**

- Create: `C:\Kalkulai\kalkulai-team-os\components\agents\AgentStartRunMenu.tsx`
- Modify: `C:\Kalkulai\kalkulai-team-os\components\agents\AgentCockpit.tsx`
- Modify: `C:\Kalkulai\kalkulai-team-os\app\globals.css`

- [ ] **Step 1: Create `AgentStartRunMenu.tsx`**

```tsx
'use client';

import { ListChecks, SquareTerminal } from 'lucide-react';

export function AgentStartRunMenu({
  open,
  onTaskStart,
  onQuickTerminal,
}: {
  open: boolean;
  onTaskStart: () => void;
  onQuickTerminal: () => void;
}) {
  if (!open) return null;
  return (
    <div className="agent-start-menu" role="menu">
      <button type="button" onClick={onTaskStart}>
        <ListChecks size={15} aria-hidden />
        <span>Aus Task starten</span>
      </button>
      <button type="button" onClick={onQuickTerminal}>
        <SquareTerminal size={15} aria-hidden />
        <span>Quick Terminal</span>
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Add launch mode type**

In `AgentCockpit.tsx`:

```ts
type LaunchMode = 'task' | 'project' | 'quick';
```

- [ ] **Step 3: Add menu state**

```ts
const [startMenuOpen, setStartMenuOpen] = useState(false);
```

- [ ] **Step 4: Render popover near Start Run**

Wrap existing `Start Run` button:

```tsx
<div className="agent-start-run-wrap">
  <button
    type="button"
    className="agent-primary agent-start-run"
    onClick={() => setStartMenuOpen((value) => !value)}
  >
    <Plus size={15} aria-hidden />
    Start Run
  </button>
  <AgentStartRunMenu
    open={startMenuOpen}
    onTaskStart={() => {
      setStartMenuOpen(false);
      setLaunchMode('task');
      setLauncherOpen(true);
    }}
    onQuickTerminal={() => {
      setStartMenuOpen(false);
      setLaunchMode('quick');
      setSelectedWorkstreamId('');
      setLauncherOpen(true);
    }}
  />
</div>
```

- [ ] **Step 5: Adjust launch payload for quick mode**

In `startRunnerSession`, set:

```ts
const launchWorkstream = launchMode === 'task' ? selectedWorkstream : null;
const title = launchMode === 'quick'
  ? `${labelForRuntime(runtime)} quick terminal`
  : launchWorkstream
    ? `${launchWorkstream.projectLabel} · ${launchWorkstream.title}`
    : selectedProject?.title ?? `${labelForRuntime(runtime)} session`;
const workGoal = launchMode === 'quick'
  ? 'Queue'
  : launchWorkstream?.projectLabel ?? selectedProject?.title ?? repoForPath(cwd)?.label ?? 'Run';
const runLabel = launchMode === 'quick'
  ? 'leer'
  : launchWorkstream?.title ?? 'Projektsequenz';
```

Payload should include:

```ts
work_goal: workGoal,
run_label: stripVisibleIds(runLabel),
title,
```

- [ ] **Step 6: Add CSS**

```css
.agent-start-run-wrap {
  position: relative;
}
.agent-start-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  z-index: 40;
  min-width: 190px;
  padding: 6px;
  border: 1px solid var(--line-1);
  border-radius: 12px;
  background: rgba(12, 16, 28, .96);
  box-shadow: 0 18px 40px rgba(0,0,0,.32);
}
.agent-start-menu button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--ink-1);
  padding: 9px 10px;
  font-size: 13px;
  font-weight: 700;
  text-align: left;
}
.agent-start-menu button:hover {
  background: rgba(255,255,255,.06);
}
```

- [ ] **Step 7: Lint**

```powershell
npx eslint components/agents/AgentStartRunMenu.tsx components/agents/AgentCockpit.tsx
```

Expected exit code 0.

- [ ] **Step 8: Commit**

```powershell
git add components/agents/AgentStartRunMenu.tsx components/agents/AgentCockpit.tsx app/globals.css
git commit -m "feat: split agent start run entry points"
```

---

## Task 7: Browser QA And Verification

**Files:**

- No expected source changes unless QA finds defects.

- [ ] **Step 1: Run unit tests**

```powershell
npm run test -- agent-workspace-graph.test.ts
```

Expected:

```text
Test Files 1 passed
```

- [ ] **Step 2: Run lint**

```powershell
npm run lint
```

Expected:

```text
eslint exits 0
```

- [ ] **Step 3: Run production build**

```powershell
npm run build
```

Expected:

```text
Compiled successfully
Finished TypeScript
Route list includes /dashboard/agents
```

- [ ] **Step 4: Restart local runner**

Only do this if no important active terminal sessions are running.

```powershell
npm run agent-runner
```

Expected:

```text
Leon Agent Runner listening on http://127.0.0.1:3217
```

- [ ] **Step 5: Browser check empty map**

Open:

```text
http://localhost:3000/dashboard/agents?member=bd695d11-0632-4a0a-b1d0-db43acf46a68
```

Expected:

- no done sessions on live map
- no permanent repo list
- clear empty state if no active sessions

- [ ] **Step 6: Browser check active session**

Create a temporary shell session through runner API:

```powershell
$body = @{
  runtime = 'shell'
  cwd = 'C:\Kalkulai\kalkulai-team-os'
  title = 'Clean map QA'
  work_goal = 'Agent Cockpit'
  run_label = 'Map QA'
  repo_key = 'team-os'
  plan_steps = @(
    @{ id = 'qa-1'; title = 'Open terminal node'; status = 'done' },
    @{ id = 'qa-2'; title = 'Inspect run details'; status = 'active' }
  )
  change_summary = @{ additions = 12; deletions = 3; files = 2 }
  subagents = @(
    @{ id = 's1'; name = 'Hilbert'; status = 'active'; runtime = 'shell' }
  )
} | ConvertTo-Json -Depth 8
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3217/sessions' -ContentType 'application/json' -Body $body
```

Expected:

- repo node shows `Team OS · 1`
- terminal rune shows `Agent Cockpit · Map QA`
- no issue ID visible
- terminal body is neutral Mac style
- one subagent figure appears under terminal
- clicking terminal opens inspector
- clicking empty canvas closes inspector

- [ ] **Step 7: Archive temporary QA session**

```powershell
$body = @{ data = "exit`r`n" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3217/sessions/<id>/input' -ContentType 'application/json' -Body $body
```

Expected:

- `/sessions` no longer returns the QA session
- `/sessions?include=archived` returns it as archived

- [ ] **Step 8: Commit QA fixes if needed**

If QA required code changes:

```powershell
git add <changed files>
git commit -m "fix: polish clean agent cockpit map base"
```

If no changes were needed, no commit.

---

## After Base Is Stable

Only after this base works in Team-OS should we research Paperclip, Conductor, and similar tools again. The research question should be narrow:

- Which interaction patterns improve terminal/session overview?
- Which manager-agent lifecycle ideas map to our Run/Queue/Inspector model?
- Which pieces can be copied conceptually without importing a new platform?

Do not start that research while the base UI semantics are still moving.

---

## Self-Review Checklist

- Spec coverage: Map semantics, terminal node, repo node, subagents, inspector, start flow, runner metadata, and verification are covered.
- Non-goals respected: no Paperclip/Conductor integration, no project nodes, no permanent repo list, no visible issue IDs.
- Type consistency: `repo`, `terminal`, `work_goal`, `run_label`, `plan_steps`, `subagents`, and `change_summary` use the same names across tasks.
- No fake progress: inspector uses `plan_steps` statuses or a single fallback current step.
- No silent done behavior: done-pending actions patch the runner explicitly; there is no silent auto-archive.

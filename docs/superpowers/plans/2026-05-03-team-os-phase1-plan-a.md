# Team OS Phase 1A — Notion Layer + Dashboard + Goals

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notion als primäre Task/KPI-Source: Dashboard zeigt Notion-Tasks + Wochenpunkte, neue /goals Seite mit KPI-Hierarchie + freier To-Do-Liste, alle Writes gehen zurück an Notion.

**Architecture:** Notion API direkt aus Next.js Server Components (fetch mit revalidate:60). Supabase nur noch für team_members (+ neue task_links Tabelle). Aggregator auf Notion-Tasks umgestellt. Neue API Routes für todos/goals/context, Bearer-Auth via DASHBOARD_API_SECRET.

**Tech Stack:** Next.js 14 App Router, Notion REST API v2022-06-28, Supabase, TypeScript, shadcn/ui (card, checkbox, progress, badge, button, input)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/002_task_links.sql` | Create | task_links table + notion_user_id column |
| `types/index.ts` | Modify | Add NotionTask, RoadmapGoal, Milestone, WeeklyKpi |
| `.env.local` | Modify | Add 3 new Notion DB env vars |
| `.env.example` | Modify | Add 3 new Notion DB env vars |
| `lib/notion.ts` | Modify | Add getMyTasks, getRoadmapGoals, getWeeklyPoints, setTaskStatus, createTask |
| `lib/aggregator.ts` | Modify | Switch from Linear tasks to Notion tasks |
| `app/dashboard/page.tsx` | Modify | Notion tasks + KPI widget |
| `components/TaskList.tsx` | Modify | Accept NotionTask[] instead of LinearIssue[] |
| `app/api/tasks/complete/route.ts` | Modify | Remove kpi_daily, add Notion status update |
| `app/api/todos/route.ts` | Create | GET todos + POST create |
| `app/api/todos/[id]/complete/route.ts` | Create | PATCH Notion status → Done |
| `app/goals/page.tsx` | Create | Goals & To-Dos page |
| `components/GoalCard.tsx` | Create | Accordion: Goal → Tasks |
| `components/TodoList.tsx` | Create | Free to-do list |
| `app/api/goals/route.ts` | Create | GET goals by member |
| `app/api/goals/create/route.ts` | Create | POST goal/task to Notion |
| `app/api/context/route.ts` | Create | GET compact context for Claude Code |
| `components/MemberSwitcher.tsx` | Modify | Add optional onSelect callback |
| `app/layout.tsx` | Modify | Add /goals nav link |

---

## Task 1: Supabase Migration

**Files:**
- Create: `supabase/migrations/002_task_links.sql`

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/002_task_links.sql

alter table team_members
  add column if not exists notion_user_id text;

create table if not exists task_links (
  id uuid primary key default gen_random_uuid(),
  notion_page_id text not null unique,
  linear_issue_id text,
  branch_name text,
  created_at timestamptz default now()
);
```

- [ ] **Step 2: Apply via Supabase MCP execute_sql**

```sql
alter table team_members add column if not exists notion_user_id text;

create table if not exists task_links (
  id uuid primary key default gen_random_uuid(),
  notion_page_id text not null unique,
  linear_issue_id text,
  branch_name text,
  created_at timestamptz default now()
);
```

Verify:
```sql
select column_name from information_schema.columns
where table_name = 'team_members' and column_name = 'notion_user_id';
-- Expected: 1 row
```

- [ ] **Step 3: Fill notion_user_id for existing members**

```sql
update team_members set notion_user_id = '2b559694-8e90-4a61-8f93-6bc57d7a2a05'
where name = 'Leon';

update team_members set notion_user_id = '43d482ab-5587-4162-948b-40632456e888'
where name = 'Felix';

update team_members set notion_user_id = '59106230-8e76-4cb2-9e8c-d0c1de24e8e4'
where name = 'Paul';
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/002_task_links.sql
git commit -m "feat: add task_links table + notion_user_id to team_members"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Add notion_user_id to TeamMember interface**

In `types/index.ts`, add `notion_user_id: string | null;` to the existing `TeamMember` interface after `google_calendar_id`:

```typescript
export interface TeamMember {
  id: string;
  name: string;
  email: string;
  telegram_chat_id: string | null;
  linear_user_id: string | null;
  github_username: string | null;
  hubspot_owner_id: string | null;
  google_calendar_id: string | null;
  notion_user_id: string | null;
  role: UserRole;
}
```

- [ ] **Step 2: Add new interfaces after existing DailyBriefing**

Append to `types/index.ts`:

```typescript
export interface NotionTask {
  id: string;
  title: string;
  status: 'Not started' | 'In progress' | 'Done' | 'On Hold';
  priority: 'High' | 'Middle' | 'Low' | null;
  effort: 'S (≤ 1 Hour)' | 'M (1 - 3 Hours)' | 'L (½–1 Working Day 4–8 h)' | 'XL (1-2 working days)' | null;
  ownerIds: string[];
  subItems: NotionTask[];
  linkedGoalId: string | null;
  linearIssueId: string | null;
  branchName: string | null;
  notionUrl: string;
}

export interface Milestone {
  id: string;
  title: string;
  tasks: NotionTask[];
  progress: { done: number; total: number };
}

export interface RoadmapGoal {
  id: string;
  title: string;
  deadline: string | null;
  milestones: Milestone[];
  freeTasks: NotionTask[];
  progress: { done: number; total: number };
}

export interface WeeklyKpi {
  memberName: string;
  actual: number;
  goal: number;
  weekLabel: string;
}
```

- [ ] **Step 3: Replace DailyBriefing to use NotionTask + WeeklyKpi**

Replace the existing `DailyBriefing` interface:

```typescript
export interface DailyBriefing {
  member: TeamMember;
  tasks: NotionTask[];
  meetings: CalendarEvent[];
  activeBranch: string | null;
  weeklyKpi: WeeklyKpi;
  unprocessedInsights: number;
}
```

- [ ] **Step 4: Verify compilation**

```bash
cd C:/kalkulai/kalkulai-team-os && npx tsc --noEmit 2>&1
```
Expected: errors in aggregator.ts and dashboard (fine — will fix in later tasks)

- [ ] **Step 5: Commit**

```bash
git add types/index.ts
git commit -m "feat: add NotionTask, RoadmapGoal, WeeklyKpi types; update DailyBriefing"
```

---

## Task 3: Env Vars

**Files:**
- Modify: `.env.local`
- Modify: `.env.example`

- [ ] **Step 1: Append to .env.local**

```
NOTION_PROJECTS_TASKS_DB_ID=6bf6eab0-446e-828d-9d1b-878341185f90
NOTION_WEEKLY_TRACKER_DB_ID=7386eab0-446e-82b8-9d4b-87b4730257ab
NOTION_ROADMAP_DB_ID=12d6eab0-446e-8314-950b-87ca1c4726fc
```

- [ ] **Step 2: Append to .env.example**

```
NOTION_PROJECTS_TASKS_DB_ID=
NOTION_WEEKLY_TRACKER_DB_ID=
NOTION_ROADMAP_DB_ID=
```

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "feat: add Notion DB env vars"
```

---

## Task 4: Notion API — Read Functions

**Files:**
- Modify: `lib/notion.ts`

- [ ] **Step 1: Add helpers + getMyTasks + getWeeklyPoints**

After the existing `notionPost` function in `lib/notion.ts`, add:

```typescript
async function notionGet<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN!}`,
      'Notion-Version': '2022-06-28',
    },
    next: { revalidate: 60 },
  });
  return res.json() as Promise<T>;
}

async function notionPatch<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN!}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<T>;
}

type NotionPageRaw = {
  id: string;
  url: string;
  properties: Record<string, {
    title?: Array<{ plain_text: string }>;
    rich_text?: Array<{ plain_text: string }>;
    status?: { name: string } | null;
    select?: { name: string } | null;
    people?: Array<{ id: string }>;
    relation?: Array<{ id: string }>;
    date?: { start: string | null } | null;
    rollup?: { type: string; number: number | null };
    number?: number | null;
  }>;
};

function parseNotionTask(page: NotionPageRaw): import('@/types').NotionTask {
  const p = page.properties;
  return {
    id: page.id,
    title: p['Project']?.title?.[0]?.plain_text ?? '(kein Titel)',
    status: (p['Status']?.status?.name ?? 'Not started') as import('@/types').NotionTask['status'],
    priority: (p['Priority']?.select?.name ?? null) as import('@/types').NotionTask['priority'],
    effort: (p['Effort']?.select?.name ?? null) as import('@/types').NotionTask['effort'],
    ownerIds: p['Owner']?.people?.map((u) => u.id) ?? [],
    subItems: [],
    linkedGoalId: p['Linked Roadmap Goal']?.relation?.[0]?.id ?? null,
    linearIssueId: p['Linear Issue ID']?.rich_text?.[0]?.plain_text ?? null,
    branchName: p['Branch Name']?.rich_text?.[0]?.plain_text ?? null,
    notionUrl: page.url,
  };
}

const PRIORITY_ORDER: Record<string, number> = { High: 0, Middle: 1, Low: 2 };

export async function getMyTasks(ownerNotionId: string): Promise<import('@/types').NotionTask[]> {
  const dbId = process.env.NOTION_PROJECTS_TASKS_DB_ID!;
  const data = await notionPost<{ results: NotionPageRaw[] }>(
    `/databases/${dbId}/query`,
    {
      filter: {
        and: [
          { property: 'Owner', people: { contains: ownerNotionId } },
          { property: 'Status', status: { does_not_equal: 'Done' } },
          { property: 'Status', status: { does_not_equal: 'On Hold' } },
        ],
      },
      page_size: 50,
    }
  );
  return (data.results ?? [])
    .map(parseNotionTask)
    .sort((a, b) =>
      (PRIORITY_ORDER[a.priority ?? 'Low'] ?? 2) - (PRIORITY_ORDER[b.priority ?? 'Low'] ?? 2)
    );
}

export async function getWeeklyPoints(
  memberNotionUserId: string,
  memberName: string
): Promise<import('@/types').WeeklyKpi> {
  const dbId = process.env.NOTION_WEEKLY_TRACKER_DB_ID!;
  const today = new Date().toISOString().split('T')[0];

  const data = await notionPost<{ results: NotionPageRaw[] }>(
    `/databases/${dbId}/query`,
    {
      filter: { property: 'Week', date: { on_or_before: today } },
      sorts: [{ property: 'Week', direction: 'descending' }],
      page_size: 1,
    }
  );

  const row = data.results?.[0];
  if (!row) return { memberName, actual: 0, goal: 0, weekLabel: '' };

  const p = row.properties;
  const actual = p[`${memberName} Points`]?.rollup?.number ?? 0;
  const goal = p['Weekly Goal']?.number ?? 0;
  const weekLabel = p['KW']?.title?.[0]?.plain_text ?? '';

  return { memberName, actual, goal, weekLabel };
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd C:/kalkulai/kalkulai-team-os && npx tsc --noEmit 2>&1
```
Expected: no new errors from notion.ts

- [ ] **Step 3: Commit**

```bash
git add lib/notion.ts
git commit -m "feat: add getMyTasks, getWeeklyPoints to Notion client"
```

---

## Task 5: Notion API — Goals + Write Functions

**Files:**
- Modify: `lib/notion.ts`

- [ ] **Step 1: Append getRoadmapGoals to lib/notion.ts**

```typescript
type RoadmapPageRaw = {
  id: string;
  url: string;
  properties: Record<string, {
    title?: Array<{ plain_text: string }>;
    date?: { start: string | null } | null;
  }>;
};

export async function getRoadmapGoals(
  ownerNotionId: string
): Promise<import('@/types').RoadmapGoal[]> {
  const tasksDbId = process.env.NOTION_PROJECTS_TASKS_DB_ID!;

  const tasksData = await notionPost<{ results: NotionPageRaw[] }>(
    `/databases/${tasksDbId}/query`,
    {
      filter: {
        and: [
          { property: 'Owner', people: { contains: ownerNotionId } },
          { property: 'Linked Roadmap Goal', relation: { is_not_empty: true } },
        ],
      },
      page_size: 100,
    }
  );

  const tasks = (tasksData.results ?? []).map(parseNotionTask);
  const goalIds = [...new Set(tasks.flatMap((t) => (t.linkedGoalId ? [t.linkedGoalId] : [])))];
  if (goalIds.length === 0) return [];

  const goalPages = await Promise.all(
    goalIds.map((id) => notionGet<RoadmapPageRaw>(`/pages/${id}`))
  );

  const tasksByGoal = new Map<string, import('@/types').NotionTask[]>();
  for (const task of tasks) {
    if (!task.linkedGoalId) continue;
    tasksByGoal.set(task.linkedGoalId, [...(tasksByGoal.get(task.linkedGoalId) ?? []), task]);
  }

  return goalPages.map((page) => {
    const goalTasks = tasksByGoal.get(page.id) ?? [];
    const done = goalTasks.filter((t) => t.status === 'Done').length;
    const p = page.properties;
    const title =
      p['Name']?.title?.[0]?.plain_text ??
      p['Goal']?.title?.[0]?.plain_text ??
      p['Project']?.title?.[0]?.plain_text ??
      '(kein Titel)';
    const deadline =
      p['Deadline']?.date?.start ?? p['Date']?.date?.start ?? null;

    return {
      id: page.id,
      title,
      deadline,
      milestones: [],
      freeTasks: goalTasks,
      progress: { done, total: goalTasks.length },
    } satisfies import('@/types').RoadmapGoal;
  });
}
```

- [ ] **Step 2: Append write functions to lib/notion.ts**

```typescript
export async function setTaskStatus(
  pageId: string,
  status: 'Not started' | 'In progress' | 'Done' | 'On Hold'
): Promise<void> {
  await notionPatch(`/pages/${pageId}`, {
    properties: { Status: { status: { name: status } } },
  });
}

export async function setTaskInProgress(
  pageId: string,
  linearIssueId: string,
  branchName: string
): Promise<void> {
  await notionPatch(`/pages/${pageId}`, {
    properties: {
      Status: { status: { name: 'In progress' } },
      'Linear Issue ID': { rich_text: [{ text: { content: linearIssueId } }] },
      'Branch Name': { rich_text: [{ text: { content: branchName } }] },
    },
  });
}

export async function createTask(params: {
  title: string;
  ownerNotionId: string;
  linkedGoalId?: string;
  effort?: string;
}): Promise<string> {
  const dbId = process.env.NOTION_PROJECTS_TASKS_DB_ID!;
  const properties: Record<string, unknown> = {
    Project: { title: [{ text: { content: params.title } }] },
    Owner: { people: [{ id: params.ownerNotionId }] },
    Status: { status: { name: 'Not started' } },
  };
  if (params.effort) properties['Effort'] = { select: { name: params.effort } };
  if (params.linkedGoalId) {
    properties['Linked Roadmap Goal'] = { relation: [{ id: params.linkedGoalId }] };
  }

  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN!}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ parent: { database_id: dbId }, properties }),
  });
  const data = await res.json() as { id: string };
  return data.id;
}
```

- [ ] **Step 3: Verify compilation**

```bash
cd C:/kalkulai/kalkulai-team-os && npx tsc --noEmit 2>&1
```
Expected: no errors from notion.ts

- [ ] **Step 4: Commit**

```bash
git add lib/notion.ts
git commit -m "feat: add getRoadmapGoals, setTaskStatus, createTask to Notion client"
```

---

## Task 6: Update Aggregator

**Files:**
- Modify: `lib/aggregator.ts`

- [ ] **Step 1: Replace lib/aggregator.ts entirely**

```typescript
import type { TeamMember, DailyBriefing, NotionTask, WeeklyKpi } from '@/types';
import { getMyTasks, getWeeklyPoints } from './notion';
import { getTodayEvents } from './calendar';
import { getActiveBranches } from './github';
import { countUnprocessedInsights } from './notion';

export async function buildDailyBriefing(member: TeamMember): Promise<DailyBriefing> {
  const results = await Promise.allSettled([
    member.notion_user_id
      ? getMyTasks(member.notion_user_id)
      : Promise.resolve<NotionTask[]>([]),
    member.google_calendar_id
      ? getTodayEvents(member.google_calendar_id)
      : Promise.resolve([]),
    getActiveBranches(),
    member.notion_user_id
      ? getWeeklyPoints(member.notion_user_id, member.name)
      : Promise.resolve<WeeklyKpi>({ memberName: member.name, actual: 0, goal: 0, weekLabel: '' }),
    countUnprocessedInsights(),
  ]);

  const tasks = results[0].status === 'fulfilled' ? results[0].value : [];
  const meetings = results[1].status === 'fulfilled' ? results[1].value : [];
  const branches = results[2].status === 'fulfilled' ? results[2].value : [];
  const weeklyKpi = results[3].status === 'fulfilled'
    ? results[3].value
    : { memberName: member.name, actual: 0, goal: 0, weekLabel: '' };
  const unprocessedInsights = results[4].status === 'fulfilled' ? results[4].value : 0;

  const activeBranch =
    branches.find((b) => b.authorLogin === member.github_username)?.name ?? null;

  return { member, tasks, meetings, activeBranch, weeklyKpi, unprocessedInsights };
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd C:/kalkulai/kalkulai-team-os && npx tsc --noEmit 2>&1
```
Expected: errors only in dashboard/page.tsx (uses old briefing shape) — fix in Task 7

- [ ] **Step 3: Commit**

```bash
git add lib/aggregator.ts
git commit -m "feat: switch aggregator from Linear tasks to Notion tasks"
```

---

## Task 7: Dashboard Page Redesign

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `components/TaskList.tsx`
- Modify: `app/api/tasks/complete/route.ts`

- [ ] **Step 1: Replace TaskList to accept NotionTask[]**

Replace `components/TaskList.tsx` entirely:

```typescript
'use client';
import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import type { NotionTask } from '@/types';

const PRIORITY_VARIANT: Record<string, 'destructive' | 'default' | 'secondary' | 'outline'> = {
  High: 'destructive',
  Middle: 'default',
  Low: 'outline',
};

export function TaskList({ tasks }: { tasks: NotionTask[] }) {
  const [done, setDone] = useState<Set<string>>(new Set());

  async function handleCheck(notionId: string) {
    setDone((prev) => new Set(prev).add(notionId));
    try {
      const res = await fetch(`/api/todos/${notionId}/complete`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? ''}`,
        },
      });
      if (!res.ok) throw new Error();
    } catch {
      setDone((prev) => { const next = new Set(prev); next.delete(notionId); return next; });
    }
  }

  if (tasks.length === 0)
    return <p className="text-sm text-muted-foreground">Keine offenen Tasks — gut gemacht!</p>;

  return (
    <ul className="space-y-2">
      {tasks.map((t) => (
        <li key={t.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted">
          <Checkbox checked={done.has(t.id)} onCheckedChange={() => handleCheck(t.id)} />
          <span className={`flex-1 text-sm ${done.has(t.id) ? 'line-through text-muted-foreground' : ''}`}>
            {t.linearIssueId && (
              <span className="text-muted-foreground mr-1 text-xs font-mono">{t.linearIssueId}</span>
            )}
            {t.title}
          </span>
          {t.priority && (
            <Badge variant={PRIORITY_VARIANT[t.priority] ?? 'outline'}>{t.priority}</Badge>
          )}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Replace app/dashboard/page.tsx**

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { TaskList } from '@/components/TaskList';
import { MeetingList } from '@/components/MeetingList';
import { KpiBar } from '@/components/KpiBar';
import { MemberSwitcher } from '@/components/MemberSwitcher';
import { buildDailyBriefing } from '@/lib/aggregator';
import { getAllMembers } from '@/lib/supabase';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { member?: string };
}) {
  const members = await getAllMembers();

  if (!members.length) {
    return (
      <div className="space-y-6">
        <p className="text-muted-foreground">Keine Teammitglieder konfiguriert.</p>
      </div>
    );
  }

  const me = members.find((m) => m.id === searchParams.member) ?? members[0];
  const briefing = await buildDailyBriefing(me);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Guten Morgen, {me.name}</h1>
          <p className="text-muted-foreground">
            {format(new Date(), 'EEEE, d. MMMM', { locale: de })}
          </p>
          {briefing.activeBranch && (
            <p className="text-xs text-muted-foreground mt-1">
              Branch: <code className="bg-muted px-1 rounded">{briefing.activeBranch}</code>
            </p>
          )}
        </div>
        <MemberSwitcher members={members} currentId={me.id} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle>Tasks heute</CardTitle>
            <Link href={`/goals?member=${me.id}`} className="text-xs text-muted-foreground hover:text-foreground">
              + Ziel anlegen
            </Link>
          </CardHeader>
          <CardContent>
            <TaskList tasks={briefing.tasks} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Meetings heute</CardTitle></CardHeader>
          <CardContent><MeetingList meetings={briefing.meetings} /></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Woche {briefing.weeklyKpi.weekLabel}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <KpiBar
            label={`${me.name} Points`}
            actual={briefing.weeklyKpi.actual}
            target={briefing.weeklyKpi.goal > 0 ? briefing.weeklyKpi.goal : 20}
          />
          {briefing.unprocessedInsights > 0 && (
            <>
              <Separator />
              <p className="text-sm text-muted-foreground">
                {briefing.unprocessedInsights} Notion Insights warten auf Verarbeitung
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Simplify app/api/tasks/complete/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { setTaskStatus } from '@/lib/notion';
import { setIssueStatus } from '@/lib/linear';

export async function POST(req: NextRequest) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body?.issueId || typeof body.issueId !== 'string') {
    return NextResponse.json({ error: 'issueId required' }, { status: 400 });
  }
  const stateId = process.env.LINEAR_DONE_STATE_ID;
  if (!stateId) return NextResponse.json({ error: 'LINEAR_DONE_STATE_ID not configured' }, { status: 500 });

  await setIssueStatus(body.issueId, stateId);
  if (body.notionPageId && typeof body.notionPageId === 'string') {
    await setTaskStatus(body.notionPageId, 'Done');
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Verify compilation**

```bash
cd C:/kalkulai/kalkulai-team-os && npx tsc --noEmit 2>&1
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/page.tsx components/TaskList.tsx app/api/tasks/complete/route.ts
git commit -m "feat: redesign dashboard with Notion tasks + Weekly Points KPI"
```

---

## Task 8: Todos API Routes

**Files:**
- Create: `app/api/todos/route.ts`
- Create: `app/api/todos/[id]/complete/route.ts`

- [ ] **Step 1: Create app/api/todos/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { getMyTasks, createTask } from '@/lib/notion';
import { getAllMembers } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const memberId = req.nextUrl.searchParams.get('member');
  if (!memberId) return NextResponse.json({ error: 'member required' }, { status: 400 });

  const members = await getAllMembers();
  const member = members.find((m) => m.id === memberId);
  if (!member?.notion_user_id) {
    return NextResponse.json({ error: 'Member not found or no Notion ID' }, { status: 404 });
  }
  const tasks = await getMyTasks(member.notion_user_id);
  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body?.title || typeof body.title !== 'string') {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }
  if (!body?.ownerNotionId || typeof body.ownerNotionId !== 'string') {
    return NextResponse.json({ error: 'ownerNotionId required' }, { status: 400 });
  }
  const id = await createTask({
    title: body.title,
    ownerNotionId: body.ownerNotionId,
    linkedGoalId: body.linkedGoalId ?? undefined,
    effort: body.effort ?? 'S (≤ 1 Hour)',
  });
  return NextResponse.json({ id });
}
```

- [ ] **Step 2: Create app/api/todos/[id]/complete/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { setTaskStatus } from '@/lib/notion';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!params.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await setTaskStatus(params.id, 'Done');
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Verify compilation**

```bash
cd C:/kalkulai/kalkulai-team-os && npx tsc --noEmit 2>&1
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add app/api/todos/
git commit -m "feat: add /api/todos routes (GET, POST, PATCH complete)"
```

---

## Task 9: Goals API Routes

**Files:**
- Create: `app/api/goals/route.ts`
- Create: `app/api/goals/create/route.ts`

- [ ] **Step 1: Create app/api/goals/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { getRoadmapGoals } from '@/lib/notion';
import { getAllMembers } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const memberId = req.nextUrl.searchParams.get('member');
  if (!memberId) return NextResponse.json({ error: 'member required' }, { status: 400 });

  const members = await getAllMembers();
  const member = members.find((m) => m.id === memberId);
  if (!member?.notion_user_id) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }
  const goals = await getRoadmapGoals(member.notion_user_id);
  return NextResponse.json(goals);
}
```

- [ ] **Step 2: Create app/api/goals/create/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createTask } from '@/lib/notion';

export async function POST(req: NextRequest) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body?.title || typeof body.title !== 'string') {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }
  if (!body?.ownerNotionId || typeof body.ownerNotionId !== 'string') {
    return NextResponse.json({ error: 'ownerNotionId required' }, { status: 400 });
  }
  const id = await createTask({
    title: body.title,
    ownerNotionId: body.ownerNotionId,
    linkedGoalId: body.linkedGoalId ?? undefined,
    effort: body.effort ?? undefined,
  });
  return NextResponse.json({ id });
}
```

- [ ] **Step 3: Verify compilation**

```bash
cd C:/kalkulai/kalkulai-team-os && npx tsc --noEmit 2>&1
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add app/api/goals/
git commit -m "feat: add /api/goals routes (GET, POST create)"
```

---

## Task 10: Context API

**Files:**
- Create: `app/api/context/route.ts`

- [ ] **Step 1: Create app/api/context/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { buildDailyBriefing } from '@/lib/aggregator';
import { getRoadmapGoals } from '@/lib/notion';
import { getAllMembers } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const memberId = req.nextUrl.searchParams.get('member');
  if (!memberId) return NextResponse.json({ error: 'member required' }, { status: 400 });

  const members = await getAllMembers();
  const member = members.find((m) => m.id === memberId);
  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

  const [briefing, goals] = await Promise.all([
    buildDailyBriefing(member),
    member.notion_user_id ? getRoadmapGoals(member.notion_user_id) : Promise.resolve([]),
  ]);

  return NextResponse.json({
    member: member.name,
    open_tasks: briefing.tasks.slice(0, 10).map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      status: t.status,
      branch: t.branchName,
    })),
    active_goals: goals.slice(0, 5).map((g) => ({
      title: g.title,
      progress: `${g.progress.done}/${g.progress.total}`,
      deadline: g.deadline,
    })),
    meetings_today: briefing.meetings.slice(0, 5).map((m) => ({
      time: m.start,
      title: m.summary,
    })),
    weekly_points: {
      actual: briefing.weeklyKpi.actual,
      goal: briefing.weeklyKpi.goal,
      week: briefing.weeklyKpi.weekLabel,
    },
    active_branch: briefing.activeBranch,
  });
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd C:/kalkulai/kalkulai-team-os && npx tsc --noEmit 2>&1
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/api/context/route.ts
git commit -m "feat: add /api/context route for Claude Code"
```

---

## Task 11: Goals Page + Components

**Files:**
- Create: `components/GoalCard.tsx`
- Create: `components/TodoList.tsx`
- Create: `app/goals/page.tsx`

- [ ] **Step 1: Create components/GoalCard.tsx**

```typescript
'use client';
import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { RoadmapGoal } from '@/types';

export function GoalCard({
  goal,
  onTaskComplete,
  onAddTask,
}: {
  goal: RoadmapGoal;
  onTaskComplete: (taskId: string) => Promise<void>;
  onAddTask: (goalId: string, title: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [newTask, setNewTask] = useState('');
  const [adding, setAdding] = useState(false);

  const pct = goal.progress.total > 0
    ? Math.round((goal.progress.done / goal.progress.total) * 100)
    : 0;

  async function handleCheck(taskId: string) {
    setDone((prev) => new Set(prev).add(taskId));
    try { await onTaskComplete(taskId); }
    catch { setDone((prev) => { const n = new Set(prev); n.delete(taskId); return n; }); }
  }

  async function handleAdd() {
    if (!newTask.trim()) return;
    setAdding(true);
    try { await onAddTask(goal.id, newTask.trim()); setNewTask(''); }
    finally { setAdding(false); }
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-3 p-4 hover:bg-muted text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{goal.title}</span>
            {goal.deadline && (
              <Badge variant="outline" className="text-xs">
                bis {new Date(goal.deadline).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Progress value={pct} className="h-1.5 flex-1" />
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {goal.progress.done}/{goal.progress.total}
            </span>
          </div>
        </div>
        <span className="text-muted-foreground text-sm ml-2">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2 border-t pt-3">
          {goal.freeTasks.length === 0 && (
            <p className="text-xs text-muted-foreground">Noch keine Tasks.</p>
          )}
          {goal.freeTasks.map((task) => (
            <div key={task.id} className="flex items-center gap-2 py-1">
              <Checkbox
                checked={done.has(task.id)}
                onCheckedChange={() => handleCheck(task.id)}
              />
              <span className={`text-sm flex-1 ${done.has(task.id) ? 'line-through text-muted-foreground' : ''}`}>
                {task.title}
              </span>
              {task.priority && (
                <Badge variant="outline" className="text-xs">{task.priority}</Badge>
              )}
            </div>
          ))}
          <div className="flex gap-2 mt-3">
            <Input
              placeholder="Neuer Task..."
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              className="h-8 text-sm"
            />
            <Button size="sm" onClick={handleAdd} disabled={adding || !newTask.trim()}>+</Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create components/TodoList.tsx**

```typescript
'use client';
import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { NotionTask } from '@/types';

export function TodoList({
  todos,
  onComplete,
  onAdd,
}: {
  todos: NotionTask[];
  onComplete: (id: string) => Promise<void>;
  onAdd: (title: string) => Promise<void>;
}) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [newItem, setNewItem] = useState('');
  const [adding, setAdding] = useState(false);

  async function handleCheck(id: string) {
    setDone((prev) => new Set(prev).add(id));
    try { await onComplete(id); }
    catch { setDone((prev) => { const n = new Set(prev); n.delete(id); return n; }); }
  }

  async function handleAdd() {
    if (!newItem.trim()) return;
    setAdding(true);
    try { await onAdd(newItem.trim()); setNewItem(''); }
    finally { setAdding(false); }
  }

  return (
    <div className="space-y-2">
      {todos.length === 0 && (
        <p className="text-sm text-muted-foreground">Keine To-Dos.</p>
      )}
      {todos.map((t) => (
        <div key={t.id} className="flex items-center gap-2 py-1">
          <Checkbox checked={done.has(t.id)} onCheckedChange={() => handleCheck(t.id)} />
          <span className={`text-sm flex-1 ${done.has(t.id) ? 'line-through text-muted-foreground' : ''}`}>
            {t.title}
          </span>
        </div>
      ))}
      <div className="flex gap-2 mt-2">
        <Input
          placeholder="Neuer To-Do..."
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          className="h-8 text-sm"
        />
        <Button size="sm" onClick={handleAdd} disabled={adding || !newItem.trim()}>+</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create app/goals/page.tsx**

```typescript
'use client';
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GoalCard } from '@/components/GoalCard';
import { TodoList } from '@/components/TodoList';
import { MemberSwitcher } from '@/components/MemberSwitcher';
import type { RoadmapGoal, NotionTask, TeamMember } from '@/types';

const AUTH = `Bearer ${process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? ''}`;

export default function GoalsPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [goals, setGoals] = useState<RoadmapGoal[]>([]);
  const [todos, setTodos] = useState<NotionTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/members', { headers: { Authorization: AUTH } })
      .then((r) => r.json())
      .then((data: TeamMember[]) => {
        setMembers(data);
        if (data.length > 0) setSelectedId(data[0].id);
      });
  }, []);

  const load = useCallback(async (memberId: string) => {
    if (!memberId) return;
    setLoading(true);
    const [goalsRes, todosRes] = await Promise.all([
      fetch(`/api/goals?member=${memberId}`, { headers: { Authorization: AUTH } }),
      fetch(`/api/todos?member=${memberId}`, { headers: { Authorization: AUTH } }),
    ]);
    const goalsData: RoadmapGoal[] = await goalsRes.json();
    const todosData: NotionTask[] = await todosRes.json();
    setGoals(Array.isArray(goalsData) ? goalsData : []);
    setTodos(Array.isArray(todosData) ? todosData.filter((t) => !t.linkedGoalId) : []);
    setLoading(false);
  }, []);

  useEffect(() => { if (selectedId) load(selectedId); }, [selectedId, load]);

  const selectedMember = members.find((m) => m.id === selectedId);

  async function handleTaskComplete(taskId: string) {
    await fetch(`/api/todos/${taskId}/complete`, {
      method: 'PATCH',
      headers: { Authorization: AUTH },
    });
  }

  async function handleAddTask(goalId: string, title: string) {
    if (!selectedMember?.notion_user_id) return;
    await fetch('/api/goals/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: AUTH },
      body: JSON.stringify({ title, ownerNotionId: selectedMember.notion_user_id, linkedGoalId: goalId }),
    });
    await load(selectedId);
  }

  async function handleAddTodo(title: string) {
    if (!selectedMember?.notion_user_id) return;
    await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: AUTH },
      body: JSON.stringify({ title, ownerNotionId: selectedMember.notion_user_id }),
    });
    await load(selectedId);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Ziele & To-Dos</h1>
        {members.length > 1 && (
          <MemberSwitcher members={members} currentId={selectedId} onSelect={setSelectedId} />
        )}
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Lädt...</p>
      ) : (
        <>
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">KPI-Ziele</h2>
            {goals.length === 0
              ? <p className="text-sm text-muted-foreground">Keine aktiven Ziele in Notion gefunden.</p>
              : goals.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    onTaskComplete={handleTaskComplete}
                    onAddTask={handleAddTask}
                  />
                ))
            }
          </div>
          <Card>
            <CardHeader><CardTitle>Freie To-Dos</CardTitle></CardHeader>
            <CardContent>
              <TodoList todos={todos} onComplete={handleTaskComplete} onAdd={handleAddTodo} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify compilation**

```bash
cd C:/kalkulai/kalkulai-team-os && npx tsc --noEmit 2>&1
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add app/goals/ components/GoalCard.tsx components/TodoList.tsx
git commit -m "feat: add /goals page with KPI hierarchy and free to-do list"
```

---

## Task 12: MemberSwitcher Update + Navigation

**Files:**
- Modify: `components/MemberSwitcher.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Update MemberSwitcher with optional onSelect**

Replace `components/MemberSwitcher.tsx`:

```typescript
'use client';
import { useRouter } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { TeamMember } from '@/types';

export function MemberSwitcher({
  members,
  currentId,
  onSelect,
}: {
  members: TeamMember[];
  currentId: string;
  onSelect?: (id: string) => void;
}) {
  const router = useRouter();

  function handleChange(id: string) {
    if (onSelect) {
      onSelect(id);
    } else {
      router.push(`/dashboard?member=${id}`);
    }
  }

  return (
    <Select value={currentId} onValueChange={handleChange}>
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {members.map((m) => (
          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 2: Add /goals to navigation in app/layout.tsx**

Replace the nav links section:

```typescript
<Link href="/dashboard" className="hover:text-foreground text-muted-foreground">Mein Tag</Link>
<Link href="/goals" className="hover:text-foreground text-muted-foreground">Ziele</Link>
<Link href="/dashboard/team" className="hover:text-foreground text-muted-foreground">Team</Link>
```

(Remove the Einstellungen link — superseded by Goals page)

- [ ] **Step 3: Final compilation check**

```bash
cd C:/kalkulai/kalkulai-team-os && npx tsc --noEmit 2>&1
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add components/MemberSwitcher.tsx app/layout.tsx
git commit -m "feat: add /goals nav + MemberSwitcher onSelect callback"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|---|---|
| Notion Tasks als Source | 4, 6 |
| Dashboard: Tasks heute | 7 |
| Dashboard: Meetings | 7 (via aggregator) |
| Dashboard: KPI Points Weekly Tracker | 4, 7 |
| Goals: Roadmap Hierarchie | 5, 11 |
| Goals: Tasks abhaken → Notion | 8, 11 |
| Goals: Task hinzufügen | 5, 9, 11 |
| Freie To-Do-Liste | 8, 11 |
| task_links Tabelle | 1 |
| notion_user_id in team_members | 1, 2 |
| /api/todos (GET/POST/PATCH) | 8 |
| /api/goals (GET/POST) | 9 |
| /api/context | 10 |
| Navigation /goals | 12 |
| MemberSwitcher auf /goals | 12 |

**Plan B (separate):** Claude Code Hook, GitHub Webhook, Telegram Briefing Cron.

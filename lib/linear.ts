import type { LinearIssue, TaskSource } from '@/types';
import { startOfWeek } from 'date-fns';

const API = 'https://api.linear.app/graphql';

async function gql(query: string, variables: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: process.env.LINEAR_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });
  const json = await res.json();
  if (json.errors) throw new Error(String(json.errors[0].message));
  return json.data as Record<string, unknown>;
}

/**
 * Resolve a task's source from its Linear labels. Convention:
 *   - 'Hermes' / 'from-hermes' → 'hermes'  (created by the Hermes agent)
 *   - 'Notion' / 'from-notion' → 'notion'  (mirrored from a Notion transcript)
 *   - everything else          → 'linear'  (manually created)
 */
function detectSource(labels: string[] | undefined): TaskSource {
  if (!labels || labels.length === 0) return 'linear';
  const lower = labels.map((l) => l.toLowerCase());
  if (lower.some((l) => l === 'hermes' || l === 'from-hermes')) return 'hermes';
  if (lower.some((l) => l === 'notion' || l === 'from-notion')) return 'notion';
  return 'linear';
}

interface LinearIssueRaw {
  id: string;
  identifier: string;
  title: string;
  priority: number;
  state: { name: string; type: string };
  assignee: { id: string; name: string } | null;
  dueDate?: string | null;
  labels?: { nodes: Array<{ name: string }> };
}

function mapIssue(raw: LinearIssueRaw): LinearIssue {
  const labelNames = raw.labels?.nodes.map((n) => n.name) ?? [];
  return {
    id: raw.id,
    identifier: raw.identifier,
    title: raw.title,
    priority: raw.priority,
    state: raw.state,
    assignee: raw.assignee,
    dueDate: raw.dueDate ?? null,
    source: detectSource(labelNames),
  };
}

export async function getIssuesForUser(linearUserId: string): Promise<LinearIssue[]> {
  // Linear's PaginationOrderBy enum supports only `createdAt` / `updatedAt`.
  // Final sort (overdue → today → priority) happens in app/dashboard/page.tsx sortTasks.
  const data = await gql(`
    query GetUserIssues($userId: ID!) {
      issues(filter: {
        assignee: { id: { eq: $userId } }
        state: { type: { nin: ["completed", "cancelled"] } }
      }, orderBy: updatedAt) {
        nodes {
          id identifier title priority dueDate
          state { name type }
          assignee { id name }
          labels { nodes { name } }
        }
      }
    }
  `, { userId: linearUserId });
  const nodes = (data.issues as { nodes: LinearIssueRaw[] }).nodes;
  return nodes.map(mapIssue);
}

export async function getAllActiveIssues(): Promise<LinearIssue[]> {
  const data = await gql(`
    query {
      issues(filter: { state: { type: { eq: "started" } } }) {
        nodes { id identifier title priority
          state { name type }
          assignee { id name }
        }
      }
    }
  `);
  return (data.issues as { nodes: LinearIssue[] }).nodes;
}

export async function setIssueStatus(issueId: string, stateId: string): Promise<void> {
  await gql(`
    mutation UpdateIssueStatus($id: String!, $stateId: String!) {
      issueUpdate(id: $id, input: { stateId: $stateId }) { success }
    }
  `, { id: issueId, stateId });
}

export async function createIssue(
  teamId: string,
  title: string,
  assigneeId?: string,
  labelIds: string[] = [],
  priority?: number,
  dueDate?: string | null,
): Promise<LinearIssue> {
  const data = await gql(
    `mutation CreateIssue(
       $teamId: String!,
       $title: String!,
       $assigneeId: String,
       $labelIds: [String!],
       $priority: Int,
       $dueDate: TimelessDate
     ) {
       issueCreate(input: {
         teamId: $teamId
         title: $title
         assigneeId: $assigneeId
         labelIds: $labelIds
         priority: $priority
         dueDate: $dueDate
       }) {
         issue {
           id identifier title priority dueDate
           state { name type }
           assignee { id name }
           labels { nodes { name } }
         }
       }
     }`,
    {
      teamId,
      title,
      assigneeId: assigneeId ?? null,
      labelIds,
      priority: typeof priority === 'number' && priority >= 0 && priority <= 4 ? priority : null,
      dueDate: dueDate || null,
    }
  );
  const raw = (data.issueCreate as { issue: LinearIssueRaw }).issue;
  return mapIssue(raw);
}

/**
 * Resolve a Linear-team label by name. Creates it if it does not exist —
 * lets Hermes/Claude Code tag tasks with arbitrary source labels without
 * pre-configuration.
 */
export async function ensureLabelId(teamId: string, name: string): Promise<string> {
  const data = await gql(
    `query GetLabel($teamId: String!, $name: String!) {
       team(id: $teamId) {
         labels(filter: { name: { eq: $name } }) {
           nodes { id name }
         }
       }
     }`,
    { teamId, name }
  );
  const existing = (data.team as { labels: { nodes: Array<{ id: string; name: string }> } })
    ?.labels?.nodes;
  if (existing && existing[0]) return existing[0].id;
  const created = await gql(
    `mutation CreateLabel($teamId: String!, $name: String!) {
       issueLabelCreate(input: { teamId: $teamId, name: $name }) {
         issueLabel { id }
       }
     }`,
    { teamId, name }
  );
  const id = (created.issueLabelCreate as { issueLabel: { id: string } }).issueLabel.id;
  return id;
}

export async function getLinearTeamId(): Promise<string> {
  const data = await gql(`query { teams { nodes { id name } } }`);
  const nodes = (data.teams as { nodes: Array<{ id: string }> }).nodes;
  if (!nodes[0]) throw new Error('No Linear team found');
  return nodes[0].id;
}

export async function getTasksCompletedThisWeek(linearUserId: string): Promise<number> {
  const since = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();
  const data = await gql(
    `query CountCompletedTasks($userId: ID!, $since: DateTimeOrDuration!) {
      issues(filter: {
        assignee: { id: { eq: $userId } }
        state: { type: { eq: "completed" } }
        completedAt: { gte: $since }
      }) { nodes { id } }
    }`,
    { userId: linearUserId, since }
  );
  return (data.issues as { nodes: unknown[] }).nodes.length;
}

export interface CompletedIssue {
  id: string;
  identifier: string;
  title: string;
  completedAt: string;
}

/**
 * Fetch issues completed by `linearUserId` since `sinceISO`. Used by the
 * Activity-Stream to render "ok" events with source "Linear".
 */
export async function getCompletedIssuesSince(
  linearUserId: string,
  sinceISO: string,
): Promise<CompletedIssue[]> {
  const data = await gql(
    `query CompletedIssuesSince($userId: ID!, $since: DateTimeOrDuration!) {
      issues(filter: {
        assignee: { id: { eq: $userId } }
        state: { type: { eq: "completed" } }
        completedAt: { gte: $since }
      }, orderBy: updatedAt) {
        nodes { id identifier title completedAt }
      }
    }`,
    { userId: linearUserId, since: sinceISO },
  );
  const nodes = (data.issues as { nodes: Array<{ id: string; identifier: string; title: string; completedAt: string }> }).nodes;
  return nodes.filter((n) => !!n.completedAt);
}

export interface CreatedIssue {
  id: string;
  identifier: string;
  title: string;
  createdAt: string;
  labels: string[];
}

/**
 * Fetch issues assigned to `linearUserId` that were created since `sinceISO`.
 * Used by the Activity-Stream to render Hermes-created tasks separately:
 *   - labels include "Hermes" / "from-hermes" → kind 'hermes', source 'Hermes'
 *   - otherwise                              → kind 'ok',     source 'Linear'
 */
export async function getCreatedIssuesSince(
  linearUserId: string,
  sinceISO: string,
): Promise<CreatedIssue[]> {
  const data = await gql(
    `query CreatedIssuesSince($userId: ID!, $since: DateTimeOrDuration!) {
      issues(filter: {
        assignee: { id: { eq: $userId } }
        createdAt: { gte: $since }
      }, orderBy: createdAt) {
        nodes { id identifier title createdAt labels { nodes { name } } }
      }
    }`,
    { userId: linearUserId, since: sinceISO },
  );
  const nodes = (data.issues as {
    nodes: Array<{
      id: string;
      identifier: string;
      title: string;
      createdAt: string | null;
      labels?: { nodes?: Array<{ name: string }> };
    }>;
  }).nodes;
  return nodes
    .filter((n) => !!n.createdAt)
    .map((n) => ({
      id: n.id,
      identifier: n.identifier,
      title: n.title,
      createdAt: n.createdAt as string,
      labels: n.labels?.nodes?.map((l) => l.name) ?? [],
    }));
}

export async function getBugsFixedThisWeek(linearUserId: string): Promise<number> {
  const since = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();
  const data = await gql(
    `query CountFixedBugs($userId: ID!, $since: DateTimeOrDuration!) {
      issues(filter: {
        assignee: { id: { eq: $userId } }
        state: { type: { eq: "completed" } }
        labels: { name: { eq: "Bug" } }
        completedAt: { gte: $since }
      }) { nodes { id } }
    }`,
    { userId: linearUserId, since }
  );
  return (data.issues as { nodes: unknown[] }).nodes.length;
}

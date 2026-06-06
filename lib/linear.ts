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
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Linear API ${res.status}: ${text.slice(0, 500)}`);
  }
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
  description?: string | null;
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
    labels: labelNames,
    description: raw.description ?? null,
  };
}

export async function getIssuesForUser(linearUserId: string): Promise<LinearIssue[]> {
  // Linear's PaginationOrderBy enum supports only `createdAt` / `updatedAt`.
  // Final sort (overdue → today → priority) happens in mergeTasks.
  const data = await gql(`
    query GetUserIssues($userId: ID!) {
      issues(filter: {
        assignee: { id: { eq: $userId } }
        state: { type: { nin: ["completed", "cancelled"] } }
      }, orderBy: updatedAt) {
        nodes {
          id identifier title priority dueDate description
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
  const data = await gql(`
    mutation UpdateIssueStatus($id: String!, $stateId: String!) {
      issueUpdate(id: $id, input: { stateId: $stateId }) { success }
    }
  `, { id: issueId, stateId });
  const ok = (data as { issueUpdate?: { success?: boolean } } | null)?.issueUpdate?.success === true;
  if (!ok) {
    throw new Error(`Linear issueUpdate returned success=false for issue ${issueId}`);
  }
}

export async function addIssueComment(issueId: string, body: string): Promise<void> {
  const data = await gql(
    `mutation AddComment($id: String!, $body: String!) {
       commentCreate(input: { issueId: $id, body: $body }) { success }
     }`,
    { id: issueId, body },
  );
  const ok = (data as { commentCreate?: { success?: boolean } } | null)?.commentCreate?.success === true;
  if (!ok) {
    throw new Error(`Linear commentCreate returned success=false for issue ${issueId}`);
  }
}

export async function updateIssueAssignee(issueId: string, assigneeId: string): Promise<void> {
  const data = await gql(
    `mutation UpdateIssueAssignee($id: String!, $assigneeId: String!) {
       issueUpdate(id: $id, input: { assigneeId: $assigneeId }) { success }
     }`,
    { id: issueId, assigneeId },
  );
  const ok = (data as { issueUpdate?: { success?: boolean } } | null)?.issueUpdate?.success === true;
  if (!ok) {
    throw new Error(`Linear issueUpdate assignee returned success=false for issue ${issueId}`);
  }
}

export async function updateIssue(
  issueId: string,
  patch: { title?: string; priority?: number | null; dueDate?: string | null; description?: string },
): Promise<void> {
  const input: Record<string, unknown> = {};
  if (patch.title !== undefined) input.title = patch.title;
  if (patch.priority !== undefined) input.priority = patch.priority;
  if (patch.dueDate !== undefined) input.dueDate = patch.dueDate;
  if (patch.description !== undefined) input.description = patch.description;
  await gql(
    `mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
       issueUpdate(id: $id, input: $input) { success }
     }`,
    { id: issueId, input },
  );
}

/** Archive a Linear issue (moves it to trash — recoverable in Linear, and
 *  excluded from the dashboard's issue queries so the card disappears). */
export async function archiveIssue(issueId: string): Promise<void> {
  await gql(
    `mutation ArchiveIssue($id: String!) {
       issueArchive(id: $id) { success }
     }`,
    { id: issueId },
  );
}

export interface LinearIssueByIdentifier {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
}

/** Resolve a Linear issue by its human identifier (`KAL-XX`). Used by the
 *  auto-outcome appender (KAL-116) which receives identifiers from hooks
 *  rather than UUIDs. Returns null when no issue matches. */
export async function getIssueByIdentifier(identifier: string): Promise<LinearIssueByIdentifier | null> {
  const data = await gql(
    `query GetByIdentifier($id: String!) {
       issue(id: $id) {
         id identifier title description
       }
     }`,
    { id: identifier },
  );
  const issue = (data as { issue: LinearIssueByIdentifier | null }).issue;
  return issue ?? null;
}

export async function createIssue(
  teamId: string,
  title: string,
  // Required. Unassigned issues don't surface in any per-member dashboard view
  // (every query filters by assignee.id). Pass null only when an unassigned
  // issue is genuinely intended — the explicit null makes the intent visible
  // at the call site. See KAL-86 / KAL-88.
  assigneeId: string | null,
  labelIds: string[] = [],
  priority?: number,
  dueDate?: string | null,
  description?: string,
): Promise<LinearIssue> {
  const data = await gql(
    `mutation CreateIssue(
       $teamId: String!,
       $title: String!,
       $assigneeId: String,
       $labelIds: [String!],
       $priority: Int,
       $dueDate: TimelessDate,
       $description: String
     ) {
       issueCreate(input: {
         teamId: $teamId
         title: $title
         assigneeId: $assigneeId
         labelIds: $labelIds
         priority: $priority
         dueDate: $dueDate
         description: $description
       }) {
         issue {
           id identifier title priority dueDate description
           state { name type }
           assignee { id name }
           labels { nodes { name } }
         }
       }
     }`,
    {
      teamId,
      title,
      assigneeId,
      labelIds,
      priority: typeof priority === 'number' && priority >= 0 && priority <= 4 ? priority : null,
      dueDate: dueDate || null,
      description: description ?? null,
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
  untilISO?: string,
): Promise<CompletedIssue[]> {
  // Optional upper bound: when set, restrict to completedAt < untilISO so
  // past-date recap queries do not leak all subsequent work (KAL-recap-bound).
  const hasUntil = !!untilISO;
  const query = hasUntil
    ? `query CompletedIssuesSince($userId: ID!, $since: DateTimeOrDuration!, $until: DateTimeOrDuration!) {
        issues(filter: {
          assignee: { id: { eq: $userId } }
          state: { type: { eq: "completed" } }
          completedAt: { gte: $since, lt: $until }
        }, orderBy: updatedAt) {
          nodes { id identifier title completedAt }
        }
      }`
    : `query CompletedIssuesSince($userId: ID!, $since: DateTimeOrDuration!) {
        issues(filter: {
          assignee: { id: { eq: $userId } }
          state: { type: { eq: "completed" } }
          completedAt: { gte: $since }
        }, orderBy: updatedAt) {
          nodes { id identifier title completedAt }
        }
      }`;
  const variables: Record<string, unknown> = { userId: linearUserId, since: sinceISO };
  if (hasUntil) variables.until = untilISO;
  const data = await gql(query, variables);
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
  untilISO?: string,
): Promise<CreatedIssue[]> {
  // Optional upper bound — see getCompletedIssuesSince above.
  const hasUntil = !!untilISO;
  const query = hasUntil
    ? `query CreatedIssuesSince($userId: ID!, $since: DateTimeOrDuration!, $until: DateTimeOrDuration!) {
        issues(filter: {
          assignee: { id: { eq: $userId } }
          createdAt: { gte: $since, lt: $until }
        }, orderBy: createdAt) {
          nodes { id identifier title createdAt labels { nodes { name } } }
        }
      }`
    : `query CreatedIssuesSince($userId: ID!, $since: DateTimeOrDuration!) {
        issues(filter: {
          assignee: { id: { eq: $userId } }
          createdAt: { gte: $since }
        }, orderBy: createdAt) {
          nodes { id identifier title createdAt labels { nodes { name } } }
        }
      }`;
  const variables: Record<string, unknown> = { userId: linearUserId, since: sinceISO };
  if (hasUntil) variables.until = untilISO;
  const data = await gql(query, variables);
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

import type { LinearIssue } from '@/types';
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
    next: { revalidate: 60 },
  });
  const json = await res.json();
  if (json.errors) throw new Error(String(json.errors[0].message));
  return json.data as Record<string, unknown>;
}

export async function getIssuesForUser(linearUserId: string): Promise<LinearIssue[]> {
  const data = await gql(`
    query GetUserIssues($userId: ID!) {
      issues(filter: {
        assignee: { id: { eq: $userId } }
        state: { type: { nin: ["completed", "cancelled"] } }
      }, orderBy: priority) {
        nodes { id identifier title priority
          state { name type }
          assignee { id name }
        }
      }
    }
  `, { userId: linearUserId });
  return (data.issues as { nodes: LinearIssue[] }).nodes;
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
  assigneeId?: string
): Promise<LinearIssue> {
  const data = await gql(`
    mutation CreateIssue($teamId: String!, $title: String!, $assigneeId: String) {
      issueCreate(input: {
        teamId: $teamId
        title: $title
        ${assigneeId ? 'assigneeId: $assigneeId' : ''}
      }) {
        issue { id identifier title priority state { name type } assignee { id name } }
      }
    }
  `, { teamId, title, assigneeId: assigneeId ?? null });
  return (data.issueCreate as { issue: LinearIssue }).issue;
}

export async function getLinearTeamId(): Promise<string> {
  const data = await gql(`query { teams { nodes { id name } } }`);
  const nodes = (data.teams as { nodes: Array<{ id: string }> }).nodes;
  if (!nodes[0]) throw new Error('No Linear team found');
  return nodes[0].id;
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

import type { LinearIssue } from '@/types';

const API = 'https://api.linear.app/graphql';

async function gql(query: string): Promise<Record<string, unknown>> {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: process.env.LINEAR_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
    next: { revalidate: 60 },
  });
  const json = await res.json();
  if (json.errors) throw new Error(String(json.errors[0].message));
  return json.data as Record<string, unknown>;
}

export async function getIssuesForUser(linearUserId: string): Promise<LinearIssue[]> {
  const data = await gql(`
    query {
      issues(filter: {
        assignee: { id: { eq: "${linearUserId}" } }
        state: { type: { nin: ["completed", "cancelled"] } }
      }, orderBy: priority) {
        nodes { id identifier title priority
          state { name type }
          assignee { id name }
        }
      }
    }
  `);
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
    mutation {
      issueUpdate(id: "${issueId}", input: { stateId: "${stateId}" }) { success }
    }
  `);
}

export async function createIssue(
  teamId: string,
  title: string,
  assigneeId?: string
): Promise<LinearIssue> {
  const assigneePart = assigneeId ? `assigneeId: "${assigneeId}"` : '';
  const data = await gql(`
    mutation {
      issueCreate(input: {
        teamId: "${teamId}"
        title: "${title.replace(/"/g, '\\"')}"
        ${assigneePart}
      }) {
        issue { id identifier title priority state { name type } assignee { id name } }
      }
    }
  `);
  return (data.issueCreate as { issue: LinearIssue }).issue;
}

export async function getLinearTeamId(): Promise<string> {
  const data = await gql(`query { teams { nodes { id name } } }`);
  return (data.teams as { nodes: Array<{ id: string }> }).nodes[0].id;
}

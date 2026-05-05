// types/index.ts

export type UserRole = 'dev' | 'sales';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  telegram_chat_id: string | null;
  linear_user_id: string | null;
  github_username: string | null;
  hubspot_owner_id: string | null;
  google_calendar_id: string | null;
  google_refresh_token: string | null;
  google_calendar_email: string | null;
  notion_user_id: string | null;
  role: UserRole;
}

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  priority: number;
  state: { name: string; type: string };
  assignee: { id: string; name: string } | null;
}

export interface GitHubBranch {
  name: string;
  commit: { sha: string; url: string };
  lastCommitDate?: string;
  authorLogin?: string;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  isSalesCall: boolean;
}

export interface HubSpotCall {
  id: string;
  timestamp: string;
  duration: number;
  ownerId: string;
}

export interface NotionInsight {
  id: string;
  title: string;
  createdAt: string;
  processed: boolean;
  url?: string;
}

export interface KpiTargets {
  tasks_target: number;
  calls_target: number;
  bugs_target: number;
}

export interface KpiDaily {
  tasks_completed: number;
  calls_made: number;
  bugs_fixed: number;
  commits_count: number;
}

export interface DailyBriefing {
  member: TeamMember;
  tasks: LinearIssue[];
  meetings: CalendarEvent[];
  activeBranch: string | null;
  weekTargets: KpiTargets;
  weekActuals: KpiDaily;
  unprocessedInsights: NotionInsight[];
}

export interface Kpi {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  unit: string;
  position: number;
  created_at: string;
}

export interface KpiWithWeek extends Kpi {
  target: number;
  actual: number;
}

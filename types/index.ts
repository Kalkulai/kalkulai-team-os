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

export type TaskSource = 'linear' | 'notion' | 'hermes' | 'local';

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  priority: number;
  state: { name: string; type: string };
  assignee: { id: string; name: string } | null;
  /** ISO 8601 due date from Linear, if set. */
  dueDate?: string | null;
  /** Origin label (computed from Linear labels). Default: 'linear'. */
  source?: TaskSource;
}

export interface GitHubBranch {
  name: string;
  commit: { sha: string; url: string };
  lastCommitDate?: string;
  authorLogin?: string;
  /** PR metadata, only populated when getActiveBranches({ withPRMeta: true }) is used. */
  prNumber?: number;
  prAuthor?: string;
  prAssignee?: string;
  prRequestedReviewer?: string;
  /** true when the commit author or branch name matches a known bot pattern. */
  isBot?: boolean;
  /** Repo this branch lives in, e.g. "Kalkulai/kalkulai". Populated when multi-repo tracking is enabled. */
  repo?: string;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  isSalesCall: boolean;
  /** Direct Google-Calendar URL for opening the event in a new tab. */
  htmlLink?: string;
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
  /** All branches actively assigned to the member — authored, PR-assignee, or PR-reviewer. */
  activeBranches: GitHubBranch[];
  weekTargets: KpiTargets;
  weekActuals: KpiDaily;
  unprocessedInsights: NotionInsight[];
}

export type KpiType = 'counter' | 'project' | 'step';

export interface Kpi {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  unit: string;
  position: number;
  type: KpiType;
  due_date: string | null;
  completed: boolean;
  created_at: string;
}

export interface KpiWithWeek extends Kpi {
  target: number;
  actual: number;
  /** Daily actual snapshots from kpi_history, oldest → newest. Length matches HISTORY_DAYS. */
  history?: number[];
}

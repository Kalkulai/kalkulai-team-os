/**
 * team-os-client.ts — Thin TypeScript-Client für das Team-OS Dashboard.
 *
 * Zweck: Copy-Paste-Template für Hermes (oder beliebige AI-Agenten), das die
 * wichtigsten Schreib-Pfade ohne Boilerplate kapselt. Keine Dependencies außer
 * `fetch` (Node 18+, Bun, oder Browser).
 *
 * Verwendung im Hermes-Repo:
 *
 *   import { TeamOSClient } from './team-os-client';
 *   const client = new TeamOSClient({
 *     baseUrl: process.env.TEAM_OS_BASE_URL,        // "https://kalkulai-team-os.vercel.app"
 *     secret:  process.env.TEAM_OS_API_SECRET,      // DASHBOARD_API_SECRET aus team-os repo
 *   });
 *
 *   const members = await client.listMembers();
 *   const leon = members.find((m) => m.name === 'Leon')!;
 *
 *   // Counter mit Wochenziel
 *   await client.createCounter({ userId: leon.id, name: 'Cold Calls', unit: 'Anrufe', weeklyTarget: 30 });
 *
 *   // Projekt mit Steps in einem Call
 *   await client.createProjectWithSteps({
 *     userId: leon.id,
 *     name: 'Hermes-Integration',
 *     dueDate: '2026-06-15',
 *     steps: [
 *       { name: 'API-Schema validieren' },
 *       { name: 'Client-Wrapper bauen', dueDate: '2026-05-25' },
 *     ],
 *   });
 *
 *   // Linear-Task aus Hermes-Insight
 *   await client.createHermesTask({ title: 'Söhnchen-Pricing einbauen', userId: leon.id });
 *
 * Vollständige Endpoint-Doku: docs/AI-OPERATIONS.md im team-os Repo.
 */

export type KpiType = 'counter' | 'project' | 'step';
export type TaskSource = 'hermes' | 'notion' | 'linear';
export type SalesLogType = 'cold-call' | 'demo' | 'follow-up';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'dev' | 'sales';
  linear_user_id: string | null;
  github_username: string | null;
  telegram_chat_id: string | null;
  hubspot_owner_id: string | null;
  google_calendar_email: string | null;
}

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
  completed_at: string | null;
  created_at: string;
  target: number;
  actual: number;
  history?: number[];
}

export interface LinearIssueRef {
  id: string;
  identifier: string;
  title: string;
  url?: string;
}

export interface TeamOSClientOptions {
  baseUrl: string;
  secret: string;
  /** Optionaler fetch-Override, default global `fetch`. */
  fetchImpl?: typeof fetch;
}

export class TeamOSClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: TeamOSClientOptions) {
    if (!opts.baseUrl) throw new Error('baseUrl required');
    if (!opts.secret)  throw new Error('secret required');
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.headers = {
      'Authorization': `Bearer ${opts.secret}`,
      'Content-Type':  'application/json',
    };
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async listMembers(): Promise<TeamMember[]> {
    return this.request<TeamMember[]>('GET', '/api/members', { auth: false });
  }

  /** Convenience: Member anhand des Namens auflösen (case-insensitive). */
  async memberByName(name: string): Promise<TeamMember | null> {
    const all = await this.listMembers();
    return all.find((m) => m.name.toLowerCase() === name.toLowerCase()) ?? null;
  }

  async listKpis(userId: string): Promise<Kpi[]> {
    return this.request<Kpi[]>('GET', `/api/kpis?userId=${encodeURIComponent(userId)}`);
  }

  async createCounter(input: {
    userId: string;
    name: string;
    unit: string;
    weeklyTarget?: number;
  }): Promise<Kpi> {
    return this.request<Kpi>('POST', '/api/kpis', {
      body: {
        user_id: input.userId,
        type: 'counter',
        name: input.name,
        unit: input.unit,
        target: input.weeklyTarget ?? 0,
      },
    });
  }

  async createProject(input: {
    userId: string;
    name: string;
    dueDate?: string; // 'YYYY-MM-DD'
  }): Promise<Kpi> {
    return this.request<Kpi>('POST', '/api/kpis', {
      body: {
        user_id: input.userId,
        type: 'project',
        name: input.name,
        due_date: input.dueDate ?? null,
      },
    });
  }

  async addStep(input: {
    userId: string;
    projectId: string;
    name: string;
    dueDate?: string;
  }): Promise<Kpi> {
    return this.request<Kpi>('POST', '/api/kpis', {
      body: {
        user_id: input.userId,
        type: 'step',
        parent_id: input.projectId,
        name: input.name,
        due_date: input.dueDate ?? null,
      },
    });
  }

  /** Atomar Projekt + N Steps anlegen. Bei Step-Fehler wird das Projekt NICHT zurückgerollt. */
  async createProjectWithSteps(input: {
    userId: string;
    name: string;
    dueDate?: string;
    steps: Array<{ name: string; dueDate?: string }>;
  }): Promise<{ project: Kpi; steps: Kpi[] }> {
    const project = await this.createProject({
      userId: input.userId,
      name: input.name,
      dueDate: input.dueDate,
    });
    const steps: Kpi[] = [];
    for (const s of input.steps) {
      steps.push(await this.addStep({
        userId: input.userId,
        projectId: project.id,
        name: s.name,
        dueDate: s.dueDate,
      }));
    }
    return { project, steps };
  }

  async incrementCounter(kpiId: string, delta = 1): Promise<{ target: number; actual: number }> {
    return this.request<{ target: number; actual: number }>(
      'POST',
      `/api/kpis/${kpiId}/adjust`,
      { body: { delta } },
    );
  }

  async completeStep(stepId: string): Promise<void> {
    await this.request('PATCH', `/api/kpis/${stepId}`, { body: { completed: true } });
  }

  async reopenStep(stepId: string): Promise<void> {
    await this.request('PATCH', `/api/kpis/${stepId}`, { body: { completed: false } });
  }

  async updateKpi(kpiId: string, patch: {
    name?: string;
    unit?: string;
    dueDate?: string | null;
    target?: number;
  }): Promise<void> {
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.unit !== undefined) body.unit = patch.unit;
    if (patch.dueDate !== undefined) body.due_date = patch.dueDate;
    if (patch.target !== undefined) body.target = patch.target;
    await this.request('PATCH', `/api/kpis/${kpiId}`, { body });
  }

  async deleteKpi(kpiId: string): Promise<void> {
    await this.request('DELETE', `/api/kpis/${kpiId}`);
  }

  /** Erstellt Linear-Issue mit Label "Hermes" → Dashboard zeigt H-Icon. */
  async createHermesTask(input: { title: string; userId: string }): Promise<LinearIssueRef> {
    return this.request<LinearIssueRef>('POST', '/api/tasks/create', {
      body: { title: input.title, userId: input.userId, source: 'hermes' as TaskSource },
    });
  }

  async createTask(input: { title: string; userId: string; source?: TaskSource }): Promise<LinearIssueRef> {
    return this.request<LinearIssueRef>('POST', '/api/tasks/create', {
      body: { title: input.title, userId: input.userId, source: input.source ?? 'hermes' },
    });
  }

  async completeTask(linearIssueId: string): Promise<void> {
    await this.request('POST', '/api/tasks/complete', { body: { issueId: linearIssueId } });
  }

  async logSalesCall(input: { userId: string; type: SalesLogType; note?: string }): Promise<void> {
    await this.request('POST', '/api/sales/log-call', {
      body: { userId: input.userId, type: input.type, note: input.note },
    });
  }

  async setWeeklyTargets(input: {
    userId: string;
    tasksTarget: number;
    callsTarget: number;
    bugsTarget: number;
    weekStart?: string; // 'YYYY-MM-DD'
  }): Promise<void> {
    await this.request('POST', '/api/kpi/set-target', {
      body: {
        userId: input.userId,
        tasks_target: input.tasksTarget,
        calls_target: input.callsTarget,
        bugs_target: input.bugsTarget,
        weekStart: input.weekStart,
      },
    });
  }

  /**
   * Smoke-Test der gesamten Pipeline für einen User.
   * Wirft, wenn irgendetwas nicht 200 zurückgibt.
   */
  async healthCheck(userId: string): Promise<{ ok: true; markdownLength: number }> {
    const res = await this.request<{ markdown: string }>(
      'GET',
      `/api/briefing/build?userId=${encodeURIComponent(userId)}`,
    );
    return { ok: true, markdownLength: res.markdown.length };
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    opts: { body?: unknown; auth?: boolean } = {},
  ): Promise<T> {
    const useAuth = opts.auth !== false;
    const headers = useAuth ? this.headers : { 'Content-Type': 'application/json' };
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new TeamOSError(`${method} ${path} → ${res.status}: ${text}`, res.status);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}

export class TeamOSError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'TeamOSError';
  }
}

import http from 'node:http';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pty from 'node-pty';
import WebSocket, { WebSocketServer } from 'ws';

await loadDotEnvLocal();

const execFileAsync = promisify(execFile);
const HOST = process.env.AGENT_RUNNER_HOST ?? '127.0.0.1';
const PORT = Number(process.env.AGENT_RUNNER_PORT ?? 3217);
const RUNNER_TOKEN = process.env.AGENT_RUNNER_TOKEN ?? null;
const ALLOWED_ORIGINS = new Set(
  (process.env.AGENT_RUNNER_ALLOWED_ORIGINS ?? 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const ALLOW_LOCAL_DEV_ORIGINS = process.env.AGENT_RUNNER_ALLOW_LOCAL_DEV_ORIGINS === undefined
  ? isLoopbackHost(HOST)
  : process.env.AGENT_RUNNER_ALLOW_LOCAL_DEV_ORIGINS !== 'false';
const ALLOWED_CWD_ROOTS = (process.env.AGENT_RUNNER_ALLOWED_CWD_ROOTS ?? 'C:\\Kalkulai')
  .split(';')
  .map((root) => path.resolve(root.trim()))
  .filter(Boolean);
const STORE_DIR = process.env.AGENT_RUNNER_HOME
  ? path.resolve(process.env.AGENT_RUNNER_HOME)
  : path.join(os.homedir(), '.kalkulai-agent-runner');
const STORE_FILE = path.join(STORE_DIR, 'sessions.json');
const MAX_BACKSCROLL = 160_000;
const DEFAULT_TEAM_OS_BASE = process.env.TEAM_OS_BASE_URL ?? 'http://127.0.0.1:3000';

const sessions = new Map();
const COMMANDS = {
  shell: shellFile(),
  codex: process.env.CODEX_CLI_PATH || await resolveCommand('codex'),
  claude: process.env.CLAUDE_CLI_PATH || await resolveCommand('claude'),
};
await fs.mkdir(STORE_DIR, { recursive: true });
await restorePersistedSessions();

const server = http.createServer((req, res) => {
  handleHttp(req, res).catch((error) => {
    sendJson(res, error?.status ?? 500, { error: error instanceof Error ? error.message : String(error) });
  });
});
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `${HOST}:${PORT}`}`);
  const match = url.pathname.match(/^\/sessions\/([^/]+)\/terminal$/);
  if (!match || !isAuthorizedRequest(req)) {
    socket.destroy();
    return;
  }
  const session = sessions.get(decodeURIComponent(match[1]));
  if (!session) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => attachTerminalSocket(session, ws));
});

server.listen(PORT, HOST, () => {
  console.log(`Leon Agent Runner listening on http://${HOST}:${PORT}`);
});

async function handleHttp(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (!isAuthorizedRequest(req)) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `${HOST}:${PORT}`}`);
  if (req.method === 'GET' && url.pathname === '/health') {
    const activeSessions = listSessions('active').length;
    sendJson(res, 200, {
      ok: true,
      message: 'Runner live',
      sessions: sessions.size,
      active_sessions: activeSessions,
      store_dir: STORE_DIR,
      safety: {
        ui_reload_preserves_sessions: true,
        runner_restart_preserves_processes: false,
        active_sessions: activeSessions,
        note: activeSessions > 0
          ? 'Frontend reloads reconnect. Restarting this runner will archive running PTY processes.'
          : 'No active PTY processes.',
      },
      capabilities: {
        shell: true,
        codex: Boolean(COMMANDS.codex),
        claude: Boolean(COMMANDS.claude),
      },
      origin_policy: {
        allow_local_dev_origins: ALLOW_LOCAL_DEV_ORIGINS,
        allowed_origins: [...ALLOWED_ORIGINS],
      },
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/sessions') {
    const include = url.searchParams.get('include') ?? 'active';
    sendJson(res, 200, { sessions: listSessions(include).map(publicSession) });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/sessions') {
    const payload = await readJson(req);
    const session = await createSession(payload);
    sendJson(res, 201, { session: publicSession(session) });
    return;
  }

  const patchMatch = url.pathname.match(/^\/sessions\/([^/]+)$/);
  if (req.method === 'PATCH' && patchMatch) {
    const session = requireSession(patchMatch[1]);
    const payload = await readJson(req);
    const patch = buildSessionPatch(payload);
    touch(session, patch);
    if (shouldCloseProcessForPatch(patch)) {
      closeSessionProcess(session, patch.status === 'failed' ? 'failed' : 'done');
    }
    if (hasTeamOsVisiblePatch(patch)) void postTeamOs(session);
    sendJson(res, 200, { session: publicSession(session) });
    return;
  }

  const inputMatch = url.pathname.match(/^\/sessions\/([^/]+)\/input$/);
  if (req.method === 'POST' && inputMatch) {
    const session = requireSession(inputMatch[1]);
    if (!session.proc || session.status === 'done' || session.status === 'failed') {
      sendJson(res, 409, { error: 'Session is not accepting input' });
      return;
    }
    const payload = await readJson(req);
    const data = typeof payload.data === 'string' ? payload.data : '';
    session.proc.write(data);
    touch(session, { current_state: 'Input received from cockpit' });
    sendJson(res, 200, { ok: true });
    return;
  }

  const resizeMatch = url.pathname.match(/^\/sessions\/([^/]+)\/resize$/);
  if (req.method === 'POST' && resizeMatch) {
    const session = requireSession(resizeMatch[1]);
    if (!session.proc || session.status === 'done' || session.status === 'failed') {
      sendJson(res, 409, { error: 'Session is not resizable' });
      return;
    }
    const payload = await readJson(req);
    const cols = Number(payload.cols);
    const rows = Number(payload.rows);
    if (Number.isFinite(cols) && Number.isFinite(rows)) session.proc.resize(cols, rows);
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

async function createSession(payload) {
  const runtime = normalizeRuntime(payload.runtime);
  const cwd = normalizeCwd(payload.cwd);
  const command = commandFor(runtime, payload.preferred_command);
  if (!command.file) {
    const error = new Error(`${runtime} CLI nicht im Runner-PATH gefunden`);
    error.status = 400;
    throw error;
  }
  const id = String(payload.id ?? randomUUID());
  const now = new Date().toISOString();
  const title = String(payload.title ?? payload.linear_identifier ?? `${runtime} session`);
  const session = {
    id,
    session_id: id,
    terminal_session_id: id,
    runtime,
    status: 'running',
    title,
    cwd,
    linear_identifier: stringOrNull(payload.linear_identifier),
    workstream: stringOrNull(payload.workstream),
    work_goal: stringOrNull(payload.work_goal),
    run_label: stringOrNull(payload.run_label),
    pinned: Boolean(payload.pinned),
    queue: arrayOrNull(payload.queue),
    plan_steps: arrayOrNull(payload.plan_steps),
    change_summary: objectOrNull(payload.change_summary),
    subagents: arrayOrNull(payload.subagents),
    done_pending: Boolean(payload.done_pending),
    user_id: stringOrNull(payload.user_id) ?? process.env.AGENT_RUNNER_USER_ID ?? 'local-leon',
    branch: stringOrNull(payload.branch),
    worktree_path: stringOrNull(payload.worktree_path) ?? cwd,
    last_decision: stringOrNull(payload.last_decision),
    current_state: `Started ${runtime} in ${cwd}`,
    next_decision: stringOrNull(payload.next_decision),
    visibility: normalizeVisibility(payload.visibility, 'active'),
    layout: normalizeLayout(payload.layout),
    repo_key: stringOrNull(payload.repo_key),
    task_id: stringOrNull(payload.task_id),
    parent_session_id: stringOrNull(payload.parent_session_id),
    started_at: now,
    updated_at: now,
    exit_code: null,
    backscroll: '',
    sockets: new Set(),
    proc: null,
  };

  try {
    session.proc = pty.spawn(command.file, command.args, {
      name: 'xterm-256color',
      cols: Number(payload.cols ?? 96),
      rows: Number(payload.rows ?? 24),
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        FORCE_COLOR: '1',
      },
    });
  } catch (cause) {
    const error = new Error(cause instanceof Error ? cause.message : String(cause));
    error.status = 400;
    throw error;
  }

  session.proc.onData((data) => {
    session.backscroll = (session.backscroll + data).slice(-MAX_BACKSCROLL);
    session.updated_at = new Date().toISOString();
    for (const socket of session.sockets) {
      if (socket.readyState === WebSocket.OPEN) socket.send(data);
    }
  });

  session.proc.onExit(({ exitCode }) => {
    const requestedStatus = session.close_requested_status;
    touch(session, {
      status: requestedStatus ?? (exitCode === 0 ? 'done' : 'failed'),
      visibility: 'archived',
      exit_code: exitCode,
      current_state: requestedStatus
        ? 'Process closed by cockpit'
        : exitCode === 0 ? 'Process exited cleanly' : `Process exited with code ${exitCode}`,
      next_decision: 'Review terminal output and decide whether to close or restart.',
    });
    void postTeamOs(session);
  });

  sessions.set(id, session);
  touch(session);
  void postTeamOs(session);

  const initialPrompt = typeof payload.initial_prompt === 'string' ? payload.initial_prompt.trim() : '';
  if (initialPrompt && runtime !== 'shell') {
    setTimeout(() => {
      if (session.status === 'running') session.proc.write(`${initialPrompt}\r`);
    }, 900);
  }

  return session;
}

function attachTerminalSocket(session, ws) {
  session.sockets.add(ws);
  if (session.backscroll) ws.send(session.backscroll);
  ws.on('message', (message) => {
    if (session.status !== 'running') return;
    session.proc.write(message.toString());
  });
  ws.on('close', () => {
    session.sockets.delete(ws);
  });
}

function requireSession(rawId) {
  const session = sessions.get(decodeURIComponent(rawId));
  if (!session) {
    const error = new Error('Session not found');
    error.status = 404;
    throw error;
  }
  return session;
}

function publicSession(session) {
  return {
    id: session.id,
    session_id: session.session_id,
    terminal_session_id: session.terminal_session_id,
    runtime: session.runtime,
    status: session.status,
    title: session.title,
    cwd: session.cwd,
    linear_identifier: session.linear_identifier,
    workstream: session.workstream,
    work_goal: stringOrNull(session.work_goal),
    run_label: stringOrNull(session.run_label),
    pinned: Boolean(session.pinned),
    queue: arrayOrNull(session.queue),
    plan_steps: arrayOrNull(session.plan_steps),
    change_summary: objectOrNull(session.change_summary),
    subagents: arrayOrNull(session.subagents),
    done_pending: Boolean(session.done_pending),
    branch: session.branch,
    worktree_path: session.worktree_path,
    last_decision: session.last_decision,
    current_state: session.current_state,
    next_decision: session.next_decision,
    started_at: session.started_at,
    updated_at: session.updated_at,
    exit_code: session.exit_code,
    visibility: session.visibility,
    layout: session.layout,
    repo_key: session.repo_key,
    task_id: session.task_id,
    parent_session_id: session.parent_session_id,
  };
}

function touch(session, patch = {}) {
  Object.assign(session, patch, { updated_at: new Date().toISOString() });
  void persistSessions();
}

function listSessions(include) {
  const values = [...sessions.values()];
  if (include === 'all') return values;
  if (include === 'archived') return values.filter(isArchivedSession);
  return values.filter(isActiveSession);
}

function isActiveSession(session) {
  return session.visibility !== 'archived' && session.status !== 'done' && session.status !== 'failed';
}

function isArchivedSession(session) {
  return session.visibility === 'archived' || session.status === 'done' || session.status === 'failed';
}

function buildSessionPatch(payload) {
  const patch = {};
  if ('status' in payload) patch.status = normalizeStatus(payload.status);
  if ('visibility' in payload) {
    const visibility = normalizeVisibility(payload.visibility, null);
    if (visibility) patch.visibility = visibility;
  }
  if ('layout' in payload) patch.layout = normalizeLayout(payload.layout);
  if ('repo_key' in payload) patch.repo_key = stringOrNull(payload.repo_key);
  if ('task_id' in payload) patch.task_id = stringOrNull(payload.task_id);
  if ('parent_session_id' in payload) patch.parent_session_id = stringOrNull(payload.parent_session_id);
  if ('work_goal' in payload) patch.work_goal = stringOrNull(payload.work_goal);
  if ('run_label' in payload) patch.run_label = stringOrNull(payload.run_label);
  if ('pinned' in payload) patch.pinned = Boolean(payload.pinned);
  if ('queue' in payload) patch.queue = arrayOrNull(payload.queue);
  if ('plan_steps' in payload) patch.plan_steps = arrayOrNull(payload.plan_steps);
  if ('change_summary' in payload) patch.change_summary = objectOrNull(payload.change_summary);
  if ('subagents' in payload) patch.subagents = arrayOrNull(payload.subagents);
  if ('done_pending' in payload) patch.done_pending = Boolean(payload.done_pending);
  if ('last_decision' in payload) patch.last_decision = stringOrNull(payload.last_decision);
  if ('current_state' in payload) patch.current_state = stringOrNull(payload.current_state);
  if ('next_decision' in payload) patch.next_decision = stringOrNull(payload.next_decision);
  return patch;
}

function hasTeamOsVisiblePatch(patch) {
  return 'status' in patch ||
    'last_decision' in patch ||
    'current_state' in patch ||
    'next_decision' in patch;
}

function shouldCloseProcessForPatch(patch) {
  return patch.visibility === 'archived' || patch.status === 'done' || patch.status === 'failed';
}

function closeSessionProcess(session, status = 'done') {
  if (!session.proc) return;
  session.close_requested_status = status;
  try {
    session.proc.kill();
  } catch {
    // If the PTY already exited, the normal onExit path will finish the session.
  }
}

async function persistSessions() {
  const payload = {
    sessions: [...sessions.values()].map((session) => ({
      ...publicSession(session),
      backscroll: session.backscroll,
    })),
  };
  await fs.writeFile(STORE_FILE, JSON.stringify(payload, null, 2), 'utf8').catch(() => {});
}

async function restorePersistedSessions() {
  const raw = await fs.readFile(STORE_FILE, 'utf8').catch(() => '');
  if (!raw) return;
  try {
    const payload = JSON.parse(raw);
    if (!Array.isArray(payload.sessions)) return;
    for (const item of payload.sessions) {
      if (!item?.id) continue;
      const restoredStatus = item.status === 'running' || item.status === 'idle' ? 'failed' : normalizeStatus(item.status);
      sessions.set(item.id, {
        ...item,
        session_id: item.session_id ?? item.id,
        terminal_session_id: item.terminal_session_id ?? item.id,
        runtime: normalizeRuntime(item.runtime),
        status: restoredStatus,
        visibility: 'archived',
        current_state: restoredStatus === 'failed' && (item.status === 'running' || item.status === 'idle')
          ? 'Runner restarted; previous process is no longer attached'
          : item.current_state ?? null,
        next_decision: item.next_decision ?? 'Review archived terminal output.',
        layout: normalizeLayout(item.layout),
        backscroll: typeof item.backscroll === 'string' ? item.backscroll : '',
        sockets: new Set(),
        proc: null,
      });
    }
  } catch {
    // Ignore corrupt local history; the runner can continue with a fresh in-memory store.
  }
}

async function postTeamOs(session) {
  const secret = process.env.DASHBOARD_API_SECRET ?? process.env.TEAM_OS_API_SECRET;
  if (!secret) return;
  await fetch(`${DEFAULT_TEAM_OS_BASE}/api/agents/sessions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      session_id: session.session_id,
      user_id: session.user_id,
      linear_identifier: session.linear_identifier,
      title: session.title,
      host: os.hostname(),
      cwd: session.cwd,
      runtime: session.runtime,
      status: session.status,
      workstream: session.workstream,
      branch: session.branch,
      worktree_path: session.worktree_path,
      terminal_session_id: session.terminal_session_id,
      last_decision: session.last_decision,
      current_state: session.current_state,
      next_decision: session.next_decision,
    }),
  }).catch(() => {});
}

function commandFor(runtime, preferredCommand) {
  const customCommand = typeof preferredCommand === 'string' ? preferredCommand.trim() : '';
  if (customCommand && customCommand !== runtime) {
    const error = new Error('preferred_command is not allowed');
    error.status = 400;
    throw error;
  }
  if (runtime === 'codex') return { file: COMMANDS.codex, args: [] };
  if (runtime === 'claude') return { file: COMMANDS.claude, args: [] };
  return { file: shellFile(), args: shellArgs() };
}

function shellFile() {
  if (process.platform === 'win32') return 'powershell.exe';
  return process.env.SHELL ?? 'bash';
}

function shellArgs() {
  if (process.platform === 'win32') return ['-NoLogo'];
  return ['-l'];
}

async function resolveCommand(name) {
  try {
    const tool = process.platform === 'win32' ? 'where.exe' : 'which';
    const { stdout } = await execFileAsync(tool, [name], { windowsHide: true });
    return stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null;
  } catch {
    return null;
  }
}

function normalizeRuntime(value) {
  return ['claude', 'codex', 'shell', 'hermes'].includes(value) ? value : 'shell';
}

function normalizeStatus(value) {
  return ['idle', 'running', 'blocked', 'review', 'done', 'failed'].includes(value) ? value : 'running';
}

function normalizeVisibility(value, fallback = 'active') {
  if (value === 'active' || value === 'archived') return value;
  return fallback;
}

function normalizeLayout(value) {
  if (!value || typeof value !== 'object') return null;
  const x = Number(value.x);
  const y = Number(value.y);
  const width = Number(value.width);
  const height = Number(value.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  return {
    x,
    y,
    width: Math.max(420, width),
    height: Math.max(300, height),
  };
}

function normalizeCwd(value) {
  const resolved = typeof value === 'string' && value.trim() ? path.resolve(value) : process.cwd();
  if (!isAllowedCwd(resolved)) {
    const error = new Error('cwd is outside the allowed runner roots');
    error.status = 400;
    throw error;
  }
  return resolved;
}

function stringOrNull(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function arrayOrNull(value) {
  return Array.isArray(value) ? value : null;
}

function objectOrNull(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res, status, payload) {
  setCors(res);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function setCors(res) {
  const origin = res.req?.headers?.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'Origin');
  }
  res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type,authorization,x-agent-runner-token');
}

function isAuthorizedRequest(req) {
  const origin = req.headers.origin;
  if (origin && !isAllowedOrigin(origin)) return false;
  if (!RUNNER_TOKEN) return true;
  const provided = req.headers['x-agent-runner-token'];
  const headerToken = Array.isArray(provided) ? provided[0] : provided;
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `${HOST}:${PORT}`}`);
  const token = headerToken ?? url.searchParams.get('token');
  return safeTokenEqual(token, RUNNER_TOKEN);
}

function safeTokenEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function isAllowedOrigin(origin) {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  if (!ALLOW_LOCAL_DEV_ORIGINS) return false;
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:') && isLoopbackHost(url.hostname);
  } catch {
    return false;
  }
}

function isLoopbackHost(hostname) {
  return hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]';
}

function isAllowedCwd(candidate) {
  const normalized = path.resolve(candidate);
  return ALLOWED_CWD_ROOTS.some((root) => {
    const rel = path.relative(root, normalized);
    return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
  });
}

async function loadDotEnvLocal() {
  const file = path.join(process.cwd(), '.env.local');
  const content = await fs.readFile(file, 'utf8').catch(() => '');
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

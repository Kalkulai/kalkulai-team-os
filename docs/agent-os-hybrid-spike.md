# Hybrid Agent-OS Spike

## Ziel

Team-OS bleibt Leons Control Plane: Tasks, KPI-Projekte, Prioritaet, Entscheidungen und Abschlussbestaetigung. Die Terminal-/Agent-Laufzeit wird bewusst nicht vorschnell selbst gebaut. Dieser Spike prueft, welche bestehende Schicht Paperclip, Conductor oder Codemux uebernehmen kann und wo Team-OS nur noch Kontext und Status synchronisiert.

## Harte Anforderungen

- Normale interaktive Terminals: Tippen, Paste, Resize, Backscroll, Reload-Reconnect.
- Claude Code, Codex CLI, Shell und spaeter Gemini/Hermes muessen als echte Prozesse laufen.
- Tasks duerfen nicht liegen bleiben: jeder Run braucht Status, aktuellen Task, Naechstes, Done-Pending und Leon-Bestaetigung.
- Keine zwei Agenten arbeiten still am selben Repo/Branch/Worktree.
- Langfristig remote-ready: Hetzner/VPS muss moeglich sein, ohne Team-OS neu zu bauen.

## Tool-Entscheidungsmatrix

| Tool | Stark fuer | Schwach fuer | Vorlaeufige Rolle |
| --- | --- | --- | --- |
| Paperclip | Manager-Agenten, Issues, Goals/Projects, Heartbeats, Approvals, Budgets, BYO-Agent-Adapter | Kein offensichtlicher Standard fuer normale live bedienbare PTY-Terminals | Control-Plane-Kandidat fuer autonome Agenten und Task-Lifecycle |
| Conductor | Lokale Mac-App, Claude/Codex-Worktrees, Diff/Review, grosse Terminal-Ansicht, Coding-Agent-UX | Nicht primär Windows/Hetzner/Team-OS-Backend; Code nicht als offensichtliche OSS-Basis nutzbar | UI-/Workflow-Inspiration, nicht Kernschicht |
| Codemux | Agent-Terminals, Worktrees, Browser, persistente PTY-Schicht, Remote Hosts via SSH/VPS | Neue Abhaengigkeit, Source-available-Lizenz/Integrationsaufwand klaeren | Realistischer Kandidat fuer Terminal-/Remote-Runner-Schicht |
| Eigener Runner | Voll kontrollierbar, direkt in Team-OS integrierbar | PTY, Auth, Remote, Persistenz und UI kosten schnell sehr viel Engineering | Nur behalten, wenn Tool-Spike zentrale Anforderungen nicht erfuellt |

Quellen:
- Paperclip: https://github.com/paperclipai/paperclip
- Paperclip Deployment: https://raw.githubusercontent.com/paperclipai/paperclip/master/docs/deploy/deployment-modes.md
- Conductor: https://www.conductor.build/
- Conductor Workspaces: https://www.conductor.build/docs/concepts/workspaces-and-branches
- Codemux: https://codemux.org/
- Codemux Docs: https://docs.codemux.org/

## Gemeinsamer Run-Kontext

Team-OS soll nur Metadaten, Status und Entscheidungen speichern. Terminal-Output bleibt bei der Runner-Schicht.

Minimaler Kontext:

```ts
type AgentRunContext = {
  run_id: string;
  task_id: string | null;
  repo_key: string;
  cwd: string;
  branch: string | null;
  runtime: 'claude' | 'codex' | 'shell' | 'gemini' | 'hermes';
  goal: string;
  queue: Array<{ task_id: string; title: string; status: 'queued' | 'running' | 'done_pending' | 'blocked' }>;
  status: 'running' | 'idle' | 'needs_leon' | 'review' | 'done_pending' | 'blocked' | 'failed';
  summary: string | null;
  last_decision: string | null;
  next_decision: string | null;
};
```

Adapter-Verhalten:
- Team-OS startet oder pinnt einen Run mit Task-/Repo-Kontext.
- Runner/Tool meldet Status, Summary, letzte Entscheidung, naechste Entscheidung und Change-Zusammenfassung zurueck.
- `done` wird nie automatisch finalisiert. Es wird `done_pending`, bis Leon bestaetigt.

## Local PoC

P0 ist Terminal-Bedienbarkeit. Der lokale Runner darf in V1 bleiben, wenn diese Checks gruen sind:

1. Team-OS und Runner laufen auf wechselnden lokalen Ports.
2. Ein Shell-Terminal startet aus Quick Terminal.
3. Eingabe im Browser erreicht den PTY-Prozess.
4. Reload zeigt Backscroll und nimmt wieder Input an.
5. Ein Task kann an einen laufenden Run gepinnt werden.
6. Abschluss erzeugt `done_pending`, nicht stilles Archiv.

Aktueller Fix: der Runner erlaubt bei lokaler Bindung an `127.0.0.1` lokale Dev-Origins auf beliebigen Ports. Fuer Remote-Runner muss `AGENT_RUNNER_ALLOW_LOCAL_DEV_ORIGINS=false` gesetzt und `AGENT_RUNNER_ALLOWED_ORIGINS` explizit gepflegt werden.

## Remote-Hetzner-Draft

Remote kommt erst nach erfolgreichem Local PoC.

Mindestanforderungen:
- Runner nur hinter Auth/Tunnel erreichbar, nicht als offener PTY-Port.
- Pro Run eigener Worktree, eindeutige Branch, Lock gegen gleiche Repo/Branch/Worktree-Kollision.
- Secrets nur serverseitig, keine Tokens im Browser-Storage.
- Audit-Events fuer Start, Input-Context, Statuswechsel, Done-Pending und Close.
- Backups fuer Runner-Metadaten, aber kein unnoetiges Persistieren voller Terminal-Ausgaben in Team-OS.
- Claude/Codex/Gemini-CLI-Login pro Server/Benutzer rechtlich und technisch pruefen.

## Entscheidung nach Spike

Nach dem Local PoC wird entschieden:

1. Codemux als Terminal-/Remote-Schicht anbinden.
2. Paperclip als Manager-Agent-/Lifecycle-Schicht anbinden.
3. Eigenen Runner nur als schmalen Team-OS-Adapter behalten.
4. Conductor-Ideen fuer UX uebernehmen, aber nicht als Kernsystem einplanen.

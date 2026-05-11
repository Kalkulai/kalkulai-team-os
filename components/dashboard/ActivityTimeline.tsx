import type { ReactNode } from 'react';
import {
  Check,
  FilePlus,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  Package,
  Phone,
  Sparkles,
  SquareCheck,
  Users,
} from 'lucide-react';

export type ActivityKind =
  | 'ok'         // Linear-Task abgeschlossen
  | 'commit'     // Commit auf Branch
  | 'branch'     // Neuer Branch (reserved for future)
  | 'pr-open'    // PR geöffnet
  | 'merge'      // PR gemerged (eigene)
  | 'dep'        // Dependabot-PR gemerged
  | 'create'     // Linear-Task erstellt (normal, ohne Hermes-Label)
  | 'step-done'  // Projekt-Teilschritt erledigt
  | 'call'       // Telefonat / Demo
  | 'hermes'     // Hermes-erstellt
  | 'standup';   // Termin

export interface ActivityEvent {
  time: string;
  text: ReactNode;
  source?: string;
  code?: string;
  kind?: ActivityKind;
}

export interface ActivityDay {
  label: string;
  date: string;
  events: ActivityEvent[];
}

const KIND_CLASS: Record<ActivityKind, string> = {
  ok: 'tl-ok',
  commit: 'tl-commit',
  branch: 'tl-branch',
  'pr-open': 'tl-branch',
  merge: 'tl-ok',
  dep: 'tl-dep',
  create: 'tl-branch',
  'step-done': 'tl-ok',
  call: 'tl-call',
  hermes: 'tl-hermes',
  standup: '',
};

function IconFor({ kind }: { kind: ActivityKind }) {
  switch (kind) {
    case 'ok':         return <Check />;
    case 'commit':     return <GitCommitHorizontal />;
    case 'branch':     return <GitBranch />;
    case 'pr-open':    return <GitPullRequest />;
    case 'merge':      return <GitMerge />;
    case 'dep':        return <Package />;
    case 'create':     return <FilePlus />;
    case 'step-done':  return <SquareCheck />;
    case 'call':       return <Phone />;
    case 'hermes':     return <Sparkles />;
    case 'standup':    return <Users />;
  }
}

export function ActivityTimeline({ days }: { days: ActivityDay[] }) {
  if (days.length === 0 || days.every((d) => d.events.length === 0)) {
    return (
      <p className="text-[13px] text-[var(--ink-3)]">
        Noch keine Aktivität heute. Sobald Commits, Tasks oder Calls eintreffen, erscheinen sie hier.
      </p>
    );
  }
  return (
    <div className="tl">
      {days.map((day) => (
        <div key={day.label}>
          <div className="tl-day">
            {day.label}
            <span className="date">· {day.date}</span>
          </div>
          {day.events.map((e, idx) => {
            const kind = e.kind ?? 'standup';
            return (
              <div key={idx} className={`tl-row ${KIND_CLASS[kind]}`}>
                <span className="tl-ic" aria-hidden>
                  <IconFor kind={kind} />
                </span>
                <span className="t">{e.time}</span>
                <p>
                  {e.text}
                  {e.code && <code>{e.code}</code>}
                  {e.source && <span className="src">· {e.source}</span>}
                </p>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

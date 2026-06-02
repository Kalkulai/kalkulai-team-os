import type { ClaudeActiveSessionSnapshot } from '@/types';

export function ActiveSessionsList({
  sessions,
}: {
  sessions: ClaudeActiveSessionSnapshot[];
}) {
  if (sessions.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {sessions.map((s) => {
        const label = s.linear_identifier ?? 'unassigned';
        const title = s.title ?? s.cwd ?? 'Claude session';
        const host = s.host ?? 'unknown host';
        const cwd = s.cwd ? compactPath(s.cwd) : null;
        const ref = s.linear_url ? (
          <a
            href={s.linear_url}
            target="_blank"
            rel="noopener noreferrer"
            className="pill pill-ok mono text-[10px] hover:underline"
          >
            {label}
          </a>
        ) : (
          <span className="pill pill-mute mono text-[10px]">{label}</span>
        );

        return (
          <div
            key={s.session_id}
            className="rounded-[8px] border border-[var(--line-1)] bg-white/[0.035] px-3 py-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium leading-snug text-[var(--ink-1)]">
                  {title}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--ink-3)]">
                  <span className="mono">{host}</span>
                  {cwd && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="max-w-[220px] truncate mono" title={s.cwd ?? undefined}>
                        {cwd}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-none flex-wrap justify-end gap-1.5">
                {ref}
                <span className="pill pill-mute mono text-[10px]">{s.idle_minutes}m idle</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function compactPath(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  if (parts.length <= 2) return path;
  return `${parts.at(-2)}\\${parts.at(-1)}`;
}


import { formatDistanceToNow, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Bot } from 'lucide-react';
import type { GitHubBranch, TeamMember } from '@/types';

function ownerLogin(b: GitHubBranch): string | undefined {
  return b.prAssignee ?? b.prRequestedReviewer ?? b.authorLogin;
}

export function TeamBranchView({ branches, members }: { branches: GitHubBranch[]; members: TeamMember[] }) {
  if (branches.length === 0)
    return <p className="text-sm text-muted-foreground">Keine aktiven Branches.</p>;

  return (
    <ul className="space-y-2">
      {branches.map((b) => {
        const login = ownerLogin(b);
        const member = login ? members.find((m) => m.github_username === login) : undefined;
        const showBot = !member && b.isBot;
        const repoShort = b.repo?.split('/').pop();
        return (
          <li key={`${b.repo ?? ''}:${b.name}`} className="flex items-center gap-3 text-sm p-2 rounded-lg bg-muted">
            <span
              className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold shrink-0"
              title={member?.name ?? login ?? (showBot ? 'Bot' : 'unbekannt')}
            >
              {member ? member.name[0] : showBot ? <Bot size={12} aria-hidden /> : '?'}
            </span>
            {repoShort && (
              <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground shrink-0 rounded-md border px-1.5 py-0.5">
                {repoShort}
              </span>
            )}
            <span className="flex-1 font-mono text-xs truncate" title={b.repo ? `${b.repo}/${b.name}` : b.name}>{b.name}</span>
            {b.lastCommitDate && (
              <span className="text-muted-foreground text-xs shrink-0">
                {(() => {
                  try { return formatDistanceToNow(parseISO(b.lastCommitDate), { locale: de, addSuffix: true }); }
                  catch { return 'unbekannt'; }
                })()}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

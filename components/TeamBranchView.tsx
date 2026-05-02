import { formatDistanceToNow, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import type { GitHubBranch, TeamMember } from '@/types';

export function TeamBranchView({ branches, members }: { branches: GitHubBranch[]; members: TeamMember[] }) {
  if (branches.length === 0)
    return <p className="text-sm text-muted-foreground">Keine aktiven Branches.</p>;

  return (
    <ul className="space-y-2">
      {branches.map((b) => {
        const member = members.find((m) => m.github_username === b.authorLogin);
        return (
          <li key={b.name} className="flex items-center gap-3 text-sm p-2 rounded-lg bg-muted">
            <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold shrink-0">
              {member?.name?.[0] ?? '?'}
            </span>
            <span className="flex-1 font-mono text-xs truncate">{b.name}</span>
            {b.lastCommitDate && (
              <span className="text-muted-foreground text-xs shrink-0">
                {formatDistanceToNow(parseISO(b.lastCommitDate), { locale: de, addSuffix: true })}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

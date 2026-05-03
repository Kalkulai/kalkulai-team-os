import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import type { DailyBriefing } from '@/types';

export function formatBriefingMarkdown(b: DailyBriefing): string {
  const date = format(new Date(), 'EEEE, d. MMMM', { locale: de });
  const lines: string[] = [];

  lines.push(`*Guten Morgen, ${b.member.name}* — ${date}`);
  lines.push('');

  if (b.activeBranch) {
    lines.push(`Aktiver Branch: \`${b.activeBranch}\``);
    lines.push('');
  }

  if (b.tasks.length > 0) {
    lines.push('*Deine Tasks*');
    for (const t of b.tasks.slice(0, 5)) {
      const prio = t.priority === 1 ? '🔥 ' : t.priority === 2 ? '⚡ ' : '';
      lines.push(`• ${prio}${t.identifier} — ${t.title}`);
    }
    if (b.tasks.length > 5) lines.push(`  …und ${b.tasks.length - 5} weitere`);
    lines.push('');
  }

  if (b.meetings.length > 0) {
    lines.push('*Heute*');
    for (const m of b.meetings) {
      try {
        const t = format(parseISO(m.start), 'HH:mm', { locale: de });
        lines.push(`• ${t} — ${m.summary}${m.isSalesCall ? ' (Sales)' : ''}`);
      } catch {
        lines.push(`• ${m.summary}`);
      }
    }
    lines.push('');
  }

  lines.push('*Diese Woche*');
  lines.push(`Tasks: ${b.weekActuals.tasks_completed}/${b.weekTargets.tasks_target}`);
  if (b.member.role === 'sales') {
    lines.push(`Calls: ${b.weekActuals.calls_made}/${b.weekTargets.calls_target}`);
  }
  if (b.member.role === 'dev' && b.weekTargets.bugs_target > 0) {
    lines.push(`Bugs: ${b.weekActuals.bugs_fixed}/${b.weekTargets.bugs_target}`);
  }

  if (b.unprocessedInsights > 0) {
    lines.push('');
    lines.push(`💡 ${b.unprocessedInsights} neue Notion-Insights`);
  }

  return lines.join('\n');
}

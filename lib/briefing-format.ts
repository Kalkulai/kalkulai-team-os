import { format, parseISO, formatDistanceToNow } from 'date-fns';
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
    // Priority 1 (urgent) + 2 (high) first, then rest by numeric priority. Top 3 in briefing.
    // Linear: 0 = no-priority (treat as lowest), 1 = urgent, 2 = high, 3 = medium, 4 = low.
    const rank = (p: number) => (p === 0 ? 99 : p);
    const sorted = [...b.tasks].sort((a, c) => {
      const aHigh = a.priority >= 1 && a.priority <= 2 ? 0 : 1;
      const cHigh = c.priority >= 1 && c.priority <= 2 ? 0 : 1;
      if (aHigh !== cHigh) return aHigh - cHigh;
      return rank(a.priority) - rank(c.priority);
    });
    const top = sorted.slice(0, 3);
    lines.push('*Top 3 heute*');
    for (const t of top) {
      const prio = t.priority === 1 ? '🔥 ' : t.priority === 2 ? '⚡ ' : '';
      lines.push(`• ${prio}${t.identifier} — ${t.title}`);
    }
    if (b.tasks.length > 3) lines.push(`  …und ${b.tasks.length - 3} weitere offen`);
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

  if (b.unprocessedInsights.length > 0) {
    lines.push('');
    lines.push('*Neue Customer-Insights*');
    for (const ins of b.unprocessedInsights) {
      let when = '';
      try {
        when = ` — ${formatDistanceToNow(parseISO(ins.createdAt), { locale: de, addSuffix: true })}`;
      } catch {
        // ignore
      }
      lines.push(`💡 ${ins.title}${when}`);
    }
  }

  return lines.join('\n');
}

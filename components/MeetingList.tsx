import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import type { CalendarEvent } from '@/types';

export function MeetingList({ meetings }: { meetings: CalendarEvent[] }) {
  if (meetings.length === 0)
    return <p className="text-sm text-muted-foreground">Keine Meetings heute.</p>;

  return (
    <ul className="space-y-2">
      {meetings.map((m) => (
        <li key={m.id} className="flex items-center gap-3 text-sm">
          <span className="font-mono text-muted-foreground w-12 shrink-0">
            {format(parseISO(m.start), 'HH:mm', { locale: de })}
          </span>
          <span className="flex-1">{m.summary}</span>
          {m.isSalesCall && (
            <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Sales</span>
          )}
        </li>
      ))}
    </ul>
  );
}

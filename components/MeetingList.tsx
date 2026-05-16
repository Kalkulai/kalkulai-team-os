import { differenceInMinutes, parseISO } from 'date-fns';
import type { CalendarEvent } from '@/types';
import { APP_TIMEZONE } from '@/lib/calendar';

function safeTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('de-DE', {
      timeZone: APP_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
    }).format(parseISO(iso));
  } catch {
    return '--:--';
  }
}

function durationMin(m: CalendarEvent): number | null {
  try {
    return Math.max(0, differenceInMinutes(parseISO(m.end), parseISO(m.start)));
  } catch {
    return null;
  }
}

function isHappeningNow(m: CalendarEvent, now: Date): boolean {
  try {
    return parseISO(m.start) <= now && parseISO(m.end) > now;
  } catch {
    return false;
  }
}

export function MeetingList({ meetings }: { meetings: CalendarEvent[] }) {
  if (meetings.length === 0) {
    return <p className="text-[13px] text-[var(--ink-3)]">Keine Termine heute.</p>;
  }

  const now = new Date();

  return (
    <ul>
      {meetings.map((m) => {
        const live = isHappeningNow(m, now);
        const dur = durationMin(m);
        const tail = m.isSalesCall ? (
          <span className="pill pill-amber">Sales</span>
        ) : dur !== null ? (
          <span className="tag">{dur} min</span>
        ) : null;

        const inner = (
          <>
            <span className="t">{safeTime(m.start)}</span>
            <span className="name">{m.summary}</span>
            {tail}
          </>
        );

        if (m.htmlLink) {
          return (
            <li key={m.id} className={`meet ${live ? 'is-now' : ''}`}>
              <a
                href={m.htmlLink}
                target="_blank"
                rel="noopener noreferrer"
                className="contents"
                title="In Google Calendar öffnen"
              >
                {inner}
              </a>
            </li>
          );
        }

        return (
          <li key={m.id} className={`meet ${live ? 'is-now' : ''}`}>
            {inner}
          </li>
        );
      })}
    </ul>
  );
}

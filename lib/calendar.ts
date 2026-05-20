import type { CalendarEvent, TeamMember } from '@/types';

export const APP_TIMEZONE = 'Europe/Berlin';

const SALES_KEYWORDS = ['demo', 'call', 'gespräch', 'meeting', 'pitch', 'kunde'];

/**
 * Build ISO 8601 datetime strings for the start and end of "today" in Berlin timezone.
 * Uses Intl APIs so no additional package is needed and the offset is always correct
 * (CET = +01:00 in winter, CEST = +02:00 in summer).
 */
function berlinDayRange(): { start: string; end: string } {
  const now = new Date();
  const localeDateStr = new Intl.DateTimeFormat('sv-SE', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now); // 'YYYY-MM-DD'

  const offsetStr = new Intl.DateTimeFormat('en', {
    timeZone: APP_TIMEZONE,
    timeZoneName: 'shortOffset',
  }).formatToParts(now).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+1';
  // 'GMT+2' → '+02:00', 'GMT+1' → '+01:00'
  const match = offsetStr.match(/GMT([+-])(\d+)/);
  const isoOffset = match ? `${match[1]}${match[2].padStart(2, '0')}:00` : '+01:00';

  return {
    start: `${localeDateStr}T00:00:00${isoOffset}`,
    end:   `${localeDateStr}T23:59:59${isoOffset}`,
  };
}

async function getAccessToken(refreshToken: string): Promise<string | null> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // warn (not error) so Next.js dev overlay does not block UI;
    // operational invalid_grant from Google is recoverable by re-OAuth.
    console.warn('[calendar] token-exchange-fail', { status: res.status, body: body.slice(0, 300) });
    return null;
  }
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

function pickRefreshToken(member: TeamMember): string | null {
  if (member.google_refresh_token) return member.google_refresh_token;
  return process.env.GOOGLE_REFRESH_TOKEN ?? null;
}

function pickCalendarId(member: TeamMember): string {
  // Priority:
  //   1. google_calendar_email — verified identity from OAuth (Settings flow)
  //   2. google_calendar_id    — legacy/manual override
  //   3. 'primary'             — canonical alias for the OAuth identity's main calendar
  return member.google_calendar_email ?? member.google_calendar_id ?? 'primary';
}

export async function getTodayEvents(member: TeamMember): Promise<CalendarEvent[]> {
  const refreshToken = pickRefreshToken(member);
  if (!refreshToken) {
    console.warn('[calendar] no-refresh-token', { memberId: member.id, name: member.name });
    return [];
  }
  const token = await getAccessToken(refreshToken);
  if (!token) {
    console.warn('[calendar] no-access-token', { memberId: member.id });
    return [];
  }

  const calendarId = pickCalendarId(member);
  const { start, end } = berlinDayRange();

  const url =
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events` +
    `?timeMin=${encodeURIComponent(start)}&timeMax=${encodeURIComponent(end)}` +
    `&timeZone=${encodeURIComponent(APP_TIMEZONE)}&singleEvents=true&orderBy=startTime`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.warn('[calendar] api-fail', {
      memberId: member.id,
      calendarId,
      status: res.status,
      body: body.slice(0, 400),
    });
    return [];
  }

  const data = (await res.json()) as {
    items?: Array<{
      id: string;
      summary?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      htmlLink?: string;
    }>;
  };

  const items = data.items ?? [];
  console.log('[calendar] events-fetched', {
    memberId: member.id,
    calendarId,
    count: items.length,
    timeMin: start,
    timeMax: end,
    tz: APP_TIMEZONE,
  });

  return items.map((e) => {
    const allDay = !e.start?.dateTime;
    return {
      id: e.id,
      summary: e.summary ?? '(kein Titel)',
      start: e.start?.dateTime ?? e.start?.date ?? '',
      end: e.end?.dateTime ?? e.end?.date ?? '',
      isSalesCall: SALES_KEYWORDS.some((kw) => (e.summary ?? '').toLowerCase().includes(kw)),
      htmlLink: e.htmlLink,
      allDay,
    };
  });
}

export function countSalesCallsToday(events: CalendarEvent[]): number {
  return events.filter((e) => e.isSalesCall).length;
}

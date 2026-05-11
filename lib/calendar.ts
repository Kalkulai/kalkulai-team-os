import type { CalendarEvent, TeamMember } from '@/types';

const SALES_KEYWORDS = ['demo', 'call', 'gespräch', 'meeting', 'pitch', 'kunde'];

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
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

  const url =
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events` +
    `?timeMin=${start}&timeMax=${end}&singleEvents=true&orderBy=startTime`;

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
  });

  return items.map((e) => ({
    id: e.id,
    summary: e.summary ?? '(kein Titel)',
    start: e.start?.dateTime ?? e.start?.date ?? '',
    end: e.end?.dateTime ?? e.end?.date ?? '',
    isSalesCall: SALES_KEYWORDS.some((kw) => (e.summary ?? '').toLowerCase().includes(kw)),
    htmlLink: e.htmlLink,
  }));
}

export function countSalesCallsToday(events: CalendarEvent[]): number {
  return events.filter((e) => e.isSalesCall).length;
}

import type { CalendarEvent } from '@/types';

const SALES_KEYWORDS = ['demo', 'call', 'gespräch', 'meeting', 'pitch', 'kunde'];

async function getAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function getTodayEvents(calendarId = 'primary'): Promise<CalendarEvent[]> {
  const token = await getAccessToken();
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events` +
      `?timeMin=${start}&timeMax=${end}&singleEvents=true&orderBy=startTime`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = (await res.json()) as {
    items?: Array<{
      id: string;
      summary?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
    }>;
  };

  return (data.items ?? []).map((e) => ({
    id: e.id,
    summary: e.summary ?? '(kein Titel)',
    start: e.start?.dateTime ?? e.start?.date ?? '',
    end: e.end?.dateTime ?? e.end?.date ?? '',
    isSalesCall: SALES_KEYWORDS.some((kw) => (e.summary ?? '').toLowerCase().includes(kw)),
  }));
}

export function countSalesCallsToday(events: CalendarEvent[]): number {
  return events.filter((e) => e.isSalesCall).length;
}

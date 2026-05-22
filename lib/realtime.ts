/**
 * Realtime broadcast helpers for live dashboard updates.
 *
 * Server-side: broadcastKanbanEvent() sends a single broadcast message to
 * Supabase Realtime channel `kanban-events`. All connected browser tabs
 * subscribed to that channel receive it and can trigger router.refresh().
 *
 * Client-side: see `components/dashboard/KanbanRealtimeListener.tsx`.
 *
 * Why broadcast instead of postgres_changes?
 *   - The webhook receiver doesn't write to a table — it only revalidates
 *     paths and emits an event. A table insert just for the broadcast would
 *     be log noise.
 *   - Broadcast is fire-and-forget, fits the webhook's quick-response need.
 */

export interface KanbanEvent {
  kind: 'issue-state-change';
  identifier: string | null;
  newState: string | null;
  at: string; // ISO 8601 UTC
}

/** Generic "something on the dashboard changed" — covers any mutation that
 * should trigger connected tabs to refresh. The client treats every event
 * on this channel as a refresh trigger regardless of `kind`. */
export interface DashboardChangeEvent {
  kind: 'dashboard-change';
  source: string; // e.g. 'tasks/status', 'kpis/adjust', 'sales/log-call'
  at: string; // ISO 8601 UTC
}

export const KANBAN_CHANNEL = 'kanban-events';

/**
 * Server-to-client broadcast via Supabase Realtime REST API.
 *
 * The Supabase JS SDK's channel.send() opens a websocket, which is unreliable
 * in serverless functions (the connection takes seconds to handshake and may
 * be killed when the function returns). The REST endpoint
 * `POST /realtime/v1/api/broadcast` is stateless — single HTTP call, fits
 * Vercel's request/response lifecycle.
 *
 * Docs: https://supabase.com/docs/guides/realtime/broadcast#broadcast-from-server-rest-api
 */
async function broadcastRaw(payload: KanbanEvent | DashboardChangeEvent): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[realtime] missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return;
  }
  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            topic: KANBAN_CHANNEL,
            event: 'kanban',
            payload,
            private: false,
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error('[realtime] broadcast HTTP', res.status, await res.text().catch(() => ''));
    }
  } catch (err) {
    console.error('[realtime] broadcast failed:', err instanceof Error ? err.message : String(err));
  }
}

export async function broadcastKanbanEvent(event: KanbanEvent): Promise<void> {
  return broadcastRaw(event);
}

/** Fire a generic dashboard-change broadcast so all connected tabs refresh.
 * Used by `revalidateDashboard()` so every mutation already wired to that
 * helper gets live propagation for free. */
export async function broadcastDashboardChange(source: string): Promise<void> {
  return broadcastRaw({
    kind: 'dashboard-change',
    source,
    at: new Date().toISOString(),
  });
}

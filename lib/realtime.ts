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

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface KanbanEvent {
  kind: 'issue-state-change';
  identifier: string | null;
  newState: string | null;
  at: string; // ISO 8601 UTC
}

export const KANBAN_CHANNEL = 'kanban-events';

let _serverClient: SupabaseClient | null = null;

function getServerClient(): SupabaseClient {
  if (_serverClient) return _serverClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('realtime: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
  }
  _serverClient = createClient(url, key, { auth: { persistSession: false } });
  return _serverClient;
}

export async function broadcastKanbanEvent(event: KanbanEvent): Promise<void> {
  try {
    const client = getServerClient();
    const channel = client.channel(KANBAN_CHANNEL);

    // Critical: subscribe() returns the channel synchronously; the actual
    // websocket handshake completes asynchronously. We MUST wait for the
    // 'SUBSCRIBED' status before sending, otherwise the broadcast packet is
    // dropped on the floor (channel still in 'joining' state).
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('subscribe timeout')), 5000);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          clearTimeout(timeout);
          reject(new Error(`subscribe failed: ${status}`));
        }
      });
    });

    await channel.send({ type: 'broadcast', event: 'kanban', payload: event });
    await client.removeChannel(channel);
  } catch (err) {
    console.error('[realtime] broadcast failed:', err instanceof Error ? err.message : String(err));
  }
}

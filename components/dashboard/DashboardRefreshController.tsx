'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const CHANNEL_NAME = 'kanban-events';

const POLL_INTERVAL_MS = 30_000;
const MIN_GAP_BETWEEN_REFRESHES_MS = 15_000;
const BROADCAST_DEDUP_WINDOW_MS = 500;

/**
 * Three-layer refresh strategy so the dashboard stays live without manual reload:
 *
 *   Layer 1 — Supabase Realtime broadcast on `kanban-events`. Fast (~sec) but
 *             only fires when a writer explicitly broadcasts. Cleared by 500 ms
 *             dedup against drag-drop bursts.
 *   Layer 2 — visibilitychange listener. When the tab becomes visible after
 *             being hidden (iOS Safari, mobile background, switched tabs),
 *             force a refresh + reconnect Realtime if the socket got dropped.
 *   Layer 3 — setInterval polling fallback (60 s) while the tab is visible.
 *             Catches everything Layer 1+2 might miss. Skipped when last
 *             refresh < 30 s ago.
 *
 * Renders nothing.
 */
export function DashboardRefreshController() {
  const router = useRouter();
  const lastRefreshAt = useRef(0);
  const clientRef = useRef<SupabaseClient | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;

    const refresh = (source: string, opts?: { force?: boolean }) => {
      const now = Date.now();
      if (!opts?.force && now - lastRefreshAt.current < BROADCAST_DEDUP_WINDOW_MS) return;
      if (opts?.force && now - lastRefreshAt.current < 1000) return;
      lastRefreshAt.current = now;
      if (typeof console !== 'undefined') {
        console.debug(`[dashboard-refresh] ${source}`);
      }
      router.refresh();
    };

    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    clientRef.current = client;

    const subscribe = () => {
      if (channelRef.current) {
        try { client.removeChannel(channelRef.current); } catch {}
        channelRef.current = null;
      }
      const ch = client.channel(CHANNEL_NAME);
      ch.on('broadcast', { event: 'kanban' }, () => refresh('broadcast'))
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.warn(`[dashboard-refresh] channel status: ${status}`);
          }
        });
      channelRef.current = ch;
    };
    subscribe();

    const onVisibility = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState === 'visible') {
        refresh('visibility-wake', { force: true });
        subscribe();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    const intervalId: ReturnType<typeof setInterval> = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastRefreshAt.current < MIN_GAP_BETWEEN_REFRESHES_MS) return;
      refresh('poll-60s');
    }, POLL_INTERVAL_MS);

    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
      clearInterval(intervalId);
      if (channelRef.current) {
        try { client.removeChannel(channelRef.current); } catch {}
        channelRef.current = null;
      }
      clientRef.current = null;
    };
  }, [router]);

  return null;
}

// Back-compat alias so existing imports (`KanbanRealtimeListener`) keep working
// until callers migrate to the new name.
export const KanbanRealtimeListener = DashboardRefreshController;

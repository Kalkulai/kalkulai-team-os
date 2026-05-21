'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const CHANNEL_NAME = 'kanban-events';

/**
 * Subscribes to the Supabase Realtime broadcast channel `kanban-events`.
 * On every received event triggers `router.refresh()` so the React Server
 * Component re-renders with fresh Linear data. No visible UI of its own.
 *
 * Throttled: at most one refresh per 500 ms even if a burst of events
 * arrives (Linear can emit several updates per drag-drop).
 */
export function KanbanRealtimeListener() {
  const router = useRouter();
  const lastRefreshAt = useRef(0);

  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;

    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const channel = client.channel(CHANNEL_NAME);
    channel
      .on('broadcast', { event: 'kanban' }, () => {
        const now = Date.now();
        if (now - lastRefreshAt.current < 500) return;
        lastRefreshAt.current = now;
        router.refresh();
      })
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [router]);

  return null;
}

import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * KAL-134 — accept a batch of vault file activity from the agents-01 cron.
 * One row per file (`path` is PK); upsert merges last_modified_at + size.
 *
 *   POST { source_host?: string, files: [{ path: string, mtime: ISO, size?: number }] }
 *     → { ok: true, upserted: N }
 *
 * The recap aggregator reads back from this table to surface non-committed
 * operations-sprint output (SOPs, drafts, ADRs) in the daily-recap.
 */

interface FileEntry {
  path?: string;
  mtime?: string;
  size?: number;
}

interface Body {
  source_host?: string;
  files?: FileEntry[];
}

const MAX_BATCH = 1000;

export async function POST(req: NextRequest) {
  if (!requireApiAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Body | null;
  const files = Array.isArray(body?.files) ? body!.files : [];
  if (files.length === 0) {
    return NextResponse.json({ ok: true, upserted: 0 });
  }
  if (files.length > MAX_BATCH) {
    return NextResponse.json({ error: `files batch exceeds ${MAX_BATCH}` }, { status: 413 });
  }

  const now = new Date().toISOString();
  const rows = files
    .filter((f): f is { path: string; mtime: string; size?: number } =>
      !!f && typeof f.path === 'string' && f.path.length > 0 && typeof f.mtime === 'string',
    )
    .map((f) => ({
      path: f.path.slice(0, 1024),
      last_modified_at: f.mtime,
      size_bytes: Number.isFinite(f.size) ? Math.max(0, Math.floor(f.size as number)) : 0,
      source_host: body?.source_host ?? null,
      updated_at: now,
    }));

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, upserted: 0 });
  }

  const { error } = await supabaseAdmin
    .from('vault_touches')
    .upsert(rows, { onConflict: 'path' });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, upserted: rows.length });
}

import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { downloadDriveFile } from '@/lib/google-drive';
import { loadPlanningData } from '@/lib/exist-planning-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FILE_IDS = [
  { id: '1XxZXNy4ZVFbGDoAkcUbwwJ2Olv_thIZm', label: 'Sachmittelplanung_v12.xlsx' },
  { id: '1nPXiZ9JYYjGwez-L5-OUZz3q7mNuXj4u', label: 'Coachingplanung_v12.xlsx' },
];

type CheckResult = {
  env: { google_service_account_json: 'present' | 'missing'; length: number };
  drive: Array<{ fileId: string; label: string; ok: boolean; bytes?: number; error?: string }>;
  loader: { ok: boolean; sachmittel_count?: number; coaching_count?: number; error?: string };
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!requireApiAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result: CheckResult = {
    env: {
      google_service_account_json: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ? 'present' : 'missing',
      length: process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.length ?? 0,
    },
    drive: [],
    loader: { ok: false },
  };

  for (const { id, label } of FILE_IDS) {
    try {
      const buf = await downloadDriveFile(id);
      result.drive.push({ fileId: id, label, ok: buf.byteLength > 0, bytes: buf.byteLength });
    } catch (err) {
      result.drive.push({ fileId: id, label, ok: false, error: String(err) });
    }
  }

  try {
    const data = await loadPlanningData();
    result.loader = {
      ok: true,
      sachmittel_count: data.items.filter((i) => i.category === 'sachmittel').length,
      coaching_count: data.items.filter((i) => i.category === 'coaching').length,
    };
  } catch (err) {
    result.loader = { ok: false, error: String(err) };
  }

  const allGreen =
    result.env.google_service_account_json === 'present' &&
    result.drive.every((d) => d.ok) &&
    result.loader.ok;

  return NextResponse.json({ ok: allGreen, checks: result }, { status: allGreen ? 200 : 500 });
}

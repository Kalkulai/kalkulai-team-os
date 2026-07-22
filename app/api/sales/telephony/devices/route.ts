import { NextRequest, NextResponse } from 'next/server';
import { requireActor } from '@/lib/auth-context';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const actor = await requireActor(req, { allowMember: true, scopes: ['sales:read'] });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tokenId = process.env.SIPGATE_TOKEN_ID!;
  const token = process.env.SIPGATE_TOKEN!;
  const auth = Buffer.from(`${tokenId}:${token}`).toString('base64');

  const [devicesRes, userRes] = await Promise.all([
    fetch('https://api.sipgate.com/v2/devices', {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    }),
    fetch('https://api.sipgate.com/v2/account', {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    }),
  ]);

  return NextResponse.json({
    env_device_id: process.env.SIPGATE_DEVICE_ID,
    env_caller_id: process.env.SIPGATE_CALLER_ID ?? null,
    devices_status: devicesRes.status,
    devices: devicesRes.ok ? await devicesRes.json() : await devicesRes.text(),
    account_status: userRes.status,
    account: userRes.ok ? await userRes.json() : await userRes.text(),
  });
}

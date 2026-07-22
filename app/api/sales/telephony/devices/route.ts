import { NextRequest, NextResponse } from 'next/server';
import { requireActor } from '@/lib/auth-context';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const actor = await requireActor(req, { allowMember: true, scopes: ['sales:read'] });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tokenId = process.env.SIPGATE_TOKEN_ID!;
  const token = process.env.SIPGATE_TOKEN!;
  const auth = Buffer.from(`${tokenId}:${token}`).toString('base64');

  const headers = { Authorization: `Basic ${auth}`, Accept: 'application/json' };

  const [usersRes, usersMeRes, accountRes] = await Promise.all([
    fetch('https://api.sipgate.com/v2/users', { headers }),
    fetch('https://api.sipgate.com/v2/users/defaultuser', { headers }),
    fetch('https://api.sipgate.com/v2/account', { headers }),
  ]);

  const usersData = usersRes.ok ? await usersRes.json() : { status: usersRes.status, body: await usersRes.text() };
  const usersMeData = usersMeRes.ok ? await usersMeRes.json() : { status: usersMeRes.status, body: await usersMeRes.text() };
  const accountData = accountRes.ok ? await accountRes.json() : await accountRes.text();

  const userDevices: Record<string, unknown> = {};
  const userList = (usersData as { items?: { id: string }[] })?.items ?? [];
  for (const u of userList.slice(0, 5)) {
    const dr = await fetch(`https://api.sipgate.com/v2/${u.id}/devices`, { headers });
    userDevices[u.id] = dr.ok ? await dr.json() : { status: dr.status };
  }

  return NextResponse.json({
    env_device_id: process.env.SIPGATE_DEVICE_ID,
    account: accountData,
    users: usersData,
    defaultuser: usersMeData,
    user_devices: userDevices,
  });
}

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

  const [usersRes, accountRes, groupsRes, numbersRes] = await Promise.all([
    fetch('https://api.sipgate.com/v2/users', { headers }),
    fetch('https://api.sipgate.com/v2/account', { headers }),
    fetch('https://api.sipgate.com/v2/groups', { headers }),
    fetch('https://api.sipgate.com/v2/numbers', { headers }),
  ]);

  const usersData = usersRes.ok ? await usersRes.json() : { status: usersRes.status, body: await usersRes.text() };
  const accountData = accountRes.ok ? await accountRes.json() : await accountRes.text();
  const groupsData = groupsRes.ok ? await groupsRes.json() : { status: groupsRes.status, body: await groupsRes.text() };
  const numbersData = numbersRes.ok ? await numbersRes.json() : { status: numbersRes.status, body: await numbersRes.text() };

  const userDevices: Record<string, unknown> = {};
  const userList = (usersData as { items?: { id: string }[] })?.items ?? [];
  for (const u of userList.slice(0, 5)) {
    const dr = await fetch(`https://api.sipgate.com/v2/${u.id}/devices`, { headers });
    userDevices[u.id] = dr.ok ? await dr.json() : { status: dr.status, body: await dr.text() };
  }

  const groupPhonelines: Record<string, unknown> = {};
  const groupDevices: Record<string, unknown> = {};
  const groupList = (groupsData as { items?: { id: string }[] })?.items ?? [];
  for (const g of groupList.slice(0, 5)) {
    const [pr, dr] = await Promise.all([
      fetch(`https://api.sipgate.com/v2/${g.id}/phonelines`, { headers }),
      fetch(`https://api.sipgate.com/v2/${g.id}/devices`, { headers }),
    ]);
    groupPhonelines[g.id] = pr.ok ? await pr.json() : { status: pr.status, body: await pr.text() };
    groupDevices[g.id] = dr.ok ? await dr.json() : { status: dr.status, body: await dr.text() };
  }

  const scopesRes = await fetch('https://api.sipgate.com/v2/authorization/userinfo', { headers });

  return NextResponse.json({
    env_token_id: tokenId ? `${tokenId.slice(0, 6)}...` : 'MISSING',
    env_token: token ? `${token.slice(0, 4)}...` : 'MISSING',
    account: accountData,
    users: usersData,
    user_devices: userDevices,
    groups: groupsData,
    group_phonelines: groupPhonelines,
    group_devices: groupDevices,
    numbers: numbersData,
    token_scopes: scopesRes.ok ? await scopesRes.json() : { status: scopesRes.status, body: await scopesRes.text() },
  });
}

import { NextRequest } from 'next/server';

export function requireApiAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${process.env.DASHBOARD_API_SECRET}`;
}

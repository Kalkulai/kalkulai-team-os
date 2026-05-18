import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { listConversations, createConversation } from '@/lib/hermes-chat';

export async function GET(req: NextRequest) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const memberId = req.nextUrl.searchParams.get('memberId');
  if (!memberId) return NextResponse.json({ error: 'memberId required' }, { status: 400 });
  const conversations = await listConversations(memberId);
  return NextResponse.json(conversations);
}

export async function POST(req: NextRequest) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null) as { memberId?: string; title?: string } | null;
  if (!body?.memberId) return NextResponse.json({ error: 'memberId required' }, { status: 400 });
  const conv = await createConversation(body.memberId, body.title);
  return NextResponse.json(conv);
}

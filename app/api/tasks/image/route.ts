import { NextRequest, NextResponse } from 'next/server';
import { LINEAR_UPLOADS_PREFIX } from '@/lib/task-images';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url || !url.startsWith(LINEAR_UPLOADS_PREFIX)) {
    return NextResponse.json({ error: 'unsupported image url' }, { status: 400 });
  }

  const upstream = await fetch(url, {
    headers: {
      Authorization: process.env.LINEAR_API_KEY ?? '',
    },
    cache: 'no-store',
  });

  if (!upstream.ok) {
    return NextResponse.json({ error: 'image fetch failed' }, { status: upstream.status });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

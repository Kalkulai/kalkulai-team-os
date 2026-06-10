import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/tasks/image/route';

describe('/api/tasks/image', () => {
  it('rejects non-Linear upload URLs', async () => {
    const req = new NextRequest(
      'http://localhost/api/tasks/image?url=https%3A%2F%2Fevil.example.com%2Fx.png',
    );

    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: 'unsupported image url' });
  });
});

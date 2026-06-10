import { NextRequest, NextResponse } from 'next/server';
import { appendImageToIssueDescription, uploadFileToLinear } from '@/lib/linear';
import { requireActor } from '@/lib/auth-context';
import { revalidateDashboard } from '@/lib/revalidate';
import { memberCanMutateIssue } from '@/lib/task-auth';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_IMAGES = 5;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await requireActor(req, { allowMember: true, scopes: ['tasks:write'] });
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  if (!(await memberCanMutateIssue(actor, id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'multipart form required' }, { status: 400 });

  const files = form.getAll('images').filter((value): value is File => value instanceof File);
  if (files.length === 0) return NextResponse.json({ error: 'images required' }, { status: 400 });
  if (files.length > MAX_IMAGES) {
    return NextResponse.json({ error: `max ${MAX_IMAGES} images` }, { status: 400 });
  }

  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'only image uploads are allowed' }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_SIZE) {
      return NextResponse.json({ error: 'image too large' }, { status: 400 });
    }
  }

  try {
    const imageUrls: string[] = [];
    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const assetUrl = await uploadFileToLinear(bytes, file.type, file.name, file.size);
      await appendImageToIssueDescription(id, assetUrl, file.name);
      imageUrls.push(assetUrl);
    }
    revalidateDashboard();
    return NextResponse.json({ imageUrls });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

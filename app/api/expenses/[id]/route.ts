import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { deleteExpense, patchExpense } from '@/lib/expense-store';
import { validatePatchExpense } from '@/lib/expense-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!requireApiAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json().catch(() => null);
  const validated = validatePatchExpense(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  try {
    const expense = await patchExpense(id, validated.value);
    if (!expense) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ expense });
  } catch (err) {
    console.error('[expenses] patch failed:', err);
    return NextResponse.json({ error: 'Expense konnte nicht aktualisiert werden' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!requireApiAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  try {
    await deleteExpense(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[expenses] delete failed:', err);
    return NextResponse.json({ error: 'Expense konnte nicht gelöscht werden' }, { status: 500 });
  }
}

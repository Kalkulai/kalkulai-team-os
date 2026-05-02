import { NextRequest, NextResponse } from 'next/server';
import { getBranchesForLinearId } from '@/lib/github';
import { getAllActiveIssues } from '@/lib/linear';
import { getAllMembers } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const linearId = req.nextUrl.searchParams.get('linearId');
  if (!linearId) return NextResponse.json({ error: 'linearId required' }, { status: 400 });

  const [branches, issues, members] = await Promise.all([
    getBranchesForLinearId(linearId),
    getAllActiveIssues(),
    getAllMembers(),
  ]);

  const issue = issues.find((i) => i.identifier === linearId);
  const assignee = issue?.assignee
    ? members.find((m) => m.linear_user_id === issue.assignee!.id) ?? null
    : null;

  return NextResponse.json({ branches, assignee, issue: issue ?? null });
}

import { NextRequest, NextResponse } from 'next/server';
import { requireActor, hasValidServiceBearer } from '@/lib/auth-context';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Known active pilot customers from pilot-activity-rules.kalkulai.json
// Matched via domain search in sales_endpoints (email/website) to avoid name ambiguity
const PILOT_DOMAIN_TERMS = [
  'malerboeck',
  'maler-beutner',
  'marla-beutner',
  'daeumer',
  'daumer',
  'malerkraft',
  'malerbetriebmueller',
  'mueller-weissling',
  'rhoen-maler',
];

export async function POST(req: NextRequest) {
  const actor = await requireActor(req, { scopes: ['sales:write'] });
  if (!actor && !hasValidServiceBearer(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Find companies via email endpoints matching known pilot domains
  const { data: matches, error } = await supabaseAdmin
    .from('sales_endpoints')
    .select('company_id, value')
    .or(PILOT_DOMAIN_TERMS.map((d) => `value.ilike.%${d}%`).join(','));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const companyIds = [...new Set((matches ?? []).map((m) => m.company_id))];
  if (companyIds.length === 0) {
    return NextResponse.json({ ok: true, seeded: 0, message: 'No pilot companies found by domain match' });
  }

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('sales_companies')
    .update({ pilot_status: 'active' })
    .in('id', companyIds)
    .select('id, name');

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, seeded: updated?.length ?? 0, companies: updated?.map((c) => c.name) });
}

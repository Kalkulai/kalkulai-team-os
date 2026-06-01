import { notFound } from 'next/navigation';
import { FinanceSection } from '@/components/finance/FinanceSection';
import { buildFinanceData } from '@/lib/finance-data';

// Dev-only, auth-free preview of the CFO-Kai finance section. Lets us eyeball
// the UI locally without the full Supabase/auth stack. Renders identical data
// to /api/finance via the shared builder. Hard-404 in production.
export const dynamic = 'force-dynamic';

export default function FinancePreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  const data = buildFinanceData();

  return (
    <div className="company-page">
      <div className="company-head">
        <h1 className="company-title">
          Finance <span className="company-sub">— Preview (auth-frei · nur dev)</span>
        </h1>
      </div>
      <FinanceSection data={data} loading={false} error={null} />
    </div>
  );
}

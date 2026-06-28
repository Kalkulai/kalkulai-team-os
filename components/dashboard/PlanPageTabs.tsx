'use client';

import Link from 'next/link';

export function PlanPageTabs({
  active,
  memberParam,
}: {
  active: 'plan' | 'team';
  memberParam?: string;
}) {
  const planHref = memberParam
    ? `/dashboard/plan?member=${memberParam}`
    : '/dashboard/plan';
  const teamHref = memberParam
    ? `/dashboard/plan?tab=team&member=${memberParam}`
    : '/dashboard/plan?tab=team';

  return (
    <div className="plan-page-tabs">
      <Link
        href={planHref}
        className={`plan-page-tab${active === 'plan' ? ' is-active' : ''}`}
      >
        Plan
      </Link>
      <Link
        href={teamHref}
        className={`plan-page-tab${active === 'team' ? ' is-active' : ''}`}
      >
        Team
      </Link>
    </div>
  );
}

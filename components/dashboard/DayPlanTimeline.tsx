import type { DayPlan, DayBlockKind } from '@/lib/day-plan';
import { blockKindClass } from '@/lib/day-plan';

const KIND_LABEL: Record<DayBlockKind, string> = {
  task: 'Task',
  meeting: 'Meeting',
  focus: 'Deep Work',
  admin: 'Admin',
  break: 'Pause',
};

/** Renders Kai's timeboxed day plan as a vertical timeline (Felix-only). */
export function DayPlanTimeline({ plan }: { plan: DayPlan }) {
  if (!plan.blocks.length) return null;
  return (
    <div className="day-plan">
      <div className="day-plan-head">
        <span className="kanban-meta-label">🤖 Kais Tagesplan</span>
        {plan.generatedBy && (
          <span className="day-plan-meta mono">{plan.blocks.length} Blöcke · {plan.generatedBy}</span>
        )}
      </div>
      <div className="day-plan-blocks">
        {plan.blocks.map((b, i) => (
          <div key={i} className={`day-block ${blockKindClass(b.kind)}`}>
            <span className="day-block-time mono">
              {b.start}–{b.end}
            </span>
            <div className="day-block-body">
              <div className="day-block-row">
                <span className="day-block-kind mono">{KIND_LABEL[b.kind]}</span>
                <span className="day-block-title">{b.title}</span>
                {b.identifier && (
                  <span className="pill pill-mute mono text-[10px]">{b.identifier}</span>
                )}
              </div>
              {b.note && <span className="day-block-note">{b.note}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

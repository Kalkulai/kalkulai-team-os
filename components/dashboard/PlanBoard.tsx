'use client';

import { useState } from 'react';
import { KanbanBoard } from './KanbanBoard';
import { BEREICHE, TOTAL_PHASES } from '@/lib/task-meta';
import type { UnifiedTask } from '@/lib/unified-tasks';
import type { ClaudeSession } from '@/types';

// ponytail: hardcoded current phase — update when phase advances
const CURRENT_PHASE = 3;

const PHASES = Array.from({ length: TOTAL_PHASES }, (_, i) => i + 1);

export function PlanBoard({
  allTasks,
  doneTasks = [],
  members = [],
  metaEnabled = false,
  projects = [],
  activeClaudeByIdentifier,
}: {
  allTasks: UnifiedTask[];
  doneTasks?: UnifiedTask[];
  members?: Array<{ id: string; name: string }>;
  metaEnabled?: boolean;
  projects?: Array<{ id: string; name: string }>;
  activeClaudeByIdentifier?: Record<string, ClaudeSession[]>;
}) {
  const [selectedPhase, setSelectedPhase] = useState<number | null>(null);
  const [selectedBereich, setSelectedBereich] = useState<string | null>(null);

  const filteredTasks = allTasks.filter((t) => {
    const phaseMatch = selectedPhase === null || t.meta?.phase === selectedPhase;
    const bereichMatch = selectedBereich === null || t.meta?.bereich === selectedBereich;
    return phaseMatch && bereichMatch;
  });

  // Count open tickets per bereich (all phases)
  const maxCount = Math.max(
    1,
    ...BEREICHE.map((b) => allTasks.filter((t) => t.meta?.bereich === b.id).length),
  );

  return (
    <div className="plan-board">
      {/* Management header */}
      <div className="plan-header glass">
        {/* Phase rail */}
        <div className="plan-section">
          <div className="plan-section-label">
            <span className="ovr">Phasen</span>
            {selectedPhase !== null && (
              <button
                type="button"
                className="plan-clear-btn"
                onClick={() => setSelectedPhase(null)}
              >
                Alle
              </button>
            )}
          </div>
          <div className="plan-phase-pills">
            {PHASES.map((p) => {
              const isCurrent = p === CURRENT_PHASE;
              const isPast = p < CURRENT_PHASE;
              const isSelected = p === selectedPhase;
              return (
                <button
                  key={p}
                  type="button"
                  className={[
                    'plan-phase-pill',
                    isSelected ? 'is-selected' : '',
                    isCurrent && !isSelected ? 'is-current' : '',
                    isPast && !isSelected ? 'is-past' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setSelectedPhase(isSelected ? null : p)}
                  title={isCurrent ? 'Aktuelle Phase' : isPast ? 'Vergangene Phase' : `Phase ${p}`}
                >
                  P{p}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bereich heatmap */}
        <div className="plan-section plan-section-heatmap">
          <div className="plan-section-label">
            <span className="ovr">Bereiche</span>
            {selectedBereich !== null && (
              <button
                type="button"
                className="plan-clear-btn"
                onClick={() => setSelectedBereich(null)}
              >
                Alle
              </button>
            )}
          </div>
          <div className="plan-heatmap">
            {BEREICHE.map((b) => {
              const count = allTasks.filter((t) => t.meta?.bereich === b.id).length;
              const intensity = count / maxCount;
              const isSelected = selectedBereich === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  className={`plan-heatmap-cell${isSelected ? ' is-selected' : ''}`}
                  style={{ '--plan-intensity': intensity } as React.CSSProperties}
                  onClick={() => setSelectedBereich(isSelected ? null : b.id)}
                  title={`${b.label}: ${count} Tickets`}
                >
                  <span className="plan-heatmap-label">{b.label}</span>
                  <span className="plan-heatmap-count mono">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Kanban — key forces remount when filter changes */}
      <KanbanBoard
        key={`${selectedPhase ?? 'all'}-${selectedBereich ?? 'all'}`}
        tasks={filteredTasks}
        doneTasks={doneTasks}
        members={members}
        metaEnabled={metaEnabled}
        projects={projects}
        activeClaudeByIdentifier={activeClaudeByIdentifier}
      />
    </div>
  );
}

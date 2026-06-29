'use client';

import { useState, useMemo } from 'react';
import { KanbanBoard } from './KanbanBoard';
import { BEREICHE, TOTAL_PHASES } from '@/lib/task-meta';
import type { UnifiedTask } from '@/lib/unified-tasks';
import type { ClaudeSession } from '@/types';

// ponytail: hardcoded current phase — update when phase advances
const CURRENT_PHASE = 1;

const PHASES = Array.from({ length: TOTAL_PHASES }, (_, i) => i + 1);

export function PlanBoard({
  allTasks,
  doneTasks = [],
  members = [],
  metaEnabled = false,
  projects = [],
  ideaTasks = [],
  activeClaudeByIdentifier,
}: {
  allTasks: UnifiedTask[];
  doneTasks?: UnifiedTask[];
  ideaTasks?: UnifiedTask[];
  members?: Array<{ id: string; name: string }>;
  metaEnabled?: boolean;
  projects?: Array<{ id: string; name: string }>;
  activeClaudeByIdentifier?: Record<string, ClaudeSession[]>;
}) {
  // 0 = Alle
  const [selectedPhase, setSelectedPhase] = useState<number>(CURRENT_PHASE);
  const [selectedBereich, setSelectedBereich] = useState<string>('angebot');
  const [ideaOpen, setIdeaOpen] = useState(false);

  // Only team-tagged tasks (phase must be set); personal tasks stay on the main board
  const teamTasks = useMemo(
    () => allTasks.filter((t) => t.meta?.phase != null),
    [allTasks],
  );
  const teamDoneTasks = doneTasks.filter((t) => t.meta?.phase != null);

  const currentPhaseCount = teamTasks.filter((t) => t.meta?.phase === CURRENT_PHASE).length;

  const maxCount = Math.max(
    1,
    ...BEREICHE.map((b) => teamTasks.filter((t) => t.meta?.bereich === b.id).length),
  );

  const filteredTasks = useMemo(
    () =>
      teamTasks.filter((t) => {
        if (selectedPhase !== 0 && t.meta?.phase !== selectedPhase) return false;
        if (selectedBereich && t.meta?.bereich !== selectedBereich) return false;
        return true;
      }),
    [teamTasks, selectedPhase, selectedBereich],
  );

  // ideaTasks filtered by the active bereich (and phase=0=all):
  // ensures only project-specific tasks (e.g. angebot) appear in the collapsed To-Do section.
  const filteredIdeaTasks = useMemo(
    () =>
      ideaTasks.filter((t) => {
        if (selectedBereich && t.meta?.bereich !== selectedBereich) return false;
        return true;
      }),
    [ideaTasks, selectedBereich],
  );

  function togglePhase(p: number) {
    setSelectedPhase((prev) => (prev === p ? 0 : p));
  }

  return (
    <div className="plan-board">
      {/* ── Management Header ── */}
      <div className="plan-header glass">
        <div className="plan-header-panels">
          {/* Left: Phase Progress */}
          <div className="plan-section">
            <div className="plan-section-label">
              <span className="ovr">Phasen</span>
            </div>
            <div className="plan-phase-trail">
              {PHASES.map((p) => {
                const isPast = p < CURRENT_PHASE;
                const isCurrent = p === CURRENT_PHASE;
                return (
                  <div
                    key={p}
                    className={[
                      'plan-trail-item',
                      isPast ? 'is-past' : '',
                      isCurrent ? 'is-current' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    title={
                      isCurrent ? 'Aktuelle Phase' : isPast ? 'Abgeschlossen' : `Phase ${p}`
                    }
                  >
                    P{p}
                  </div>
                );
              })}
            </div>
            <div className="plan-phase-stat">
              <span className="ovr">Aktuelle Phase: P{CURRENT_PHASE}</span>
              {currentPhaseCount > 0 && (
                <span className="plan-phase-stat-count mono">
                  {currentPhaseCount} offen
                </span>
              )}
            </div>
          </div>

          {/* Right: Bereich Heatmap */}
          <div className="plan-section plan-section-heatmap">
            <div className="plan-section-label">
              <span className="ovr">Bereiche</span>
              {selectedBereich && (
                <button
                  type="button"
                  className="plan-clear-btn"
                  onClick={() => setSelectedBereich('')}
                >
                  Alle
                </button>
              )}
            </div>
            <div className="plan-heatmap">
              {BEREICHE.map((b) => {
                const count = teamTasks.filter((t) => t.meta?.bereich === b.id).length;
                const intensity = count / maxCount;
                const isSelected = selectedBereich === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    className={`plan-heatmap-cell${isSelected ? ' is-selected' : ''}`}
                    style={{ '--plan-intensity': intensity } as React.CSSProperties}
                    onClick={() => setSelectedBereich(isSelected ? '' : b.id)}
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

        {/* Active filter chip */}
        {selectedBereich && (
          <div className="plan-filter-row">
            <span className="plan-filter-chip">
              {BEREICHE.find((b) => b.id === selectedBereich)?.label}
              <button
                type="button"
                className="plan-filter-chip-clear"
                onClick={() => setSelectedBereich('')}
                aria-label="Filter entfernen"
              >
                ×
              </button>
            </span>
          </div>
        )}
      </div>

      {/* ── Phase Tabs ── */}
      <div className="plan-phase-tabs">
        <button
          type="button"
          className={`plan-tab${selectedPhase === 0 ? ' is-active' : ''}`}
          onClick={() => setSelectedPhase(0)}
        >
          Alle
        </button>
        {PHASES.map((p) => {
          const count = teamTasks.filter((t) => t.meta?.phase === p).length;
          return (
            <button
              key={p}
              type="button"
              className={[
                'plan-tab',
                selectedPhase === p ? 'is-active' : '',
                p === CURRENT_PHASE ? 'is-current-phase' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => togglePhase(p)}
            >
              P{p}
              {p === CURRENT_PHASE && <span className="plan-tab-arrow">←</span>}
              {count > 0 && <span className="plan-tab-count">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* ── Projekt-To-Do-Sektion (collapsed by default, bereich-filtered) ── */}
      {filteredIdeaTasks.length > 0 && (
        <div className="kanban-backlog">
          <button
            type="button"
            className="kanban-backlog-toggle"
            onClick={() => setIdeaOpen((v) => !v)}
            aria-expanded={ideaOpen}
          >
            <span className="kanban-col-title">To Do</span>
            <span className="kanban-col-count mono">{filteredIdeaTasks.length}</span>
            <span className="kanban-backlog-chevron">{ideaOpen ? '▾' : '▸'}</span>
          </button>
          {ideaOpen && (
            <KanbanBoard
              tasks={filteredIdeaTasks.filter((t) => t.status !== 'done')}
              doneTasks={filteredIdeaTasks.filter((t) => t.status === 'done')}
              members={members}
              metaEnabled={metaEnabled}
              projects={projects}
              activeClaudeByIdentifier={activeClaudeByIdentifier}
            />
          )}
        </div>
      )}

      {/* ── Kanban ── */}
      <KanbanBoard
        key={`${selectedPhase}-${selectedBereich}`}
        tasks={filteredTasks}
        doneTasks={teamDoneTasks}
        members={members}
        metaEnabled={metaEnabled}
        projects={projects}
        activeClaudeByIdentifier={activeClaudeByIdentifier}
      />
    </div>
  );
}

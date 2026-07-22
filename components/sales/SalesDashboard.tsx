'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type {
  SalesCompanyListItem, SalesCompanyDetail, SalesEndpoint,
  SalesCompanyInsights, SalesActivity, SalesStage,
} from '@/types/sales';
import { ContactForm } from '@/components/sales/ContactForm';

// ── Constants ─────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<SalesStage, string> = {
  prospecting:   'Akquise',
  discovery:     'Erstgespräch',
  evaluation:    'Evaluation',
  pilot:         'Aktiver Pilot',
  expansion:     'Expansion',
  customer:      'Kunde',
  disqualified:  'Disqualifiziert',
};

const STAGE_CLASS: Record<SalesStage, string> = {
  prospecting:   'stage-prospecting',
  discovery:     'stage-discovery',
  evaluation:    'stage-evaluation',
  pilot:         'stage-pilot',
  expansion:     'stage-expansion',
  customer:      'stage-customer',
  disqualified:  'stage-disqualified',
};

const PIPELINE_STAGES: SalesStage[] = ['discovery', 'evaluation', 'pilot'];

const ACTIVITY_ICON: Record<string, string> = {
  call: '📞', email: '✉', whatsapp: '💬', meeting: '📅',
  task: '✓', note: '📝', transcript: '🎙', sync: '↻',
};

const SIGNAL_LABEL: Record<string, string> = {
  hot: 'Hot', warm: 'Warm', cold: 'Kalt', unknown: 'Unbekannt',
};

const OBJECTIONS = [
  {
    q: 'Kein Budget',
    a: 'Verstehe ich. Wie viel verliert Ihr Team monatlich durch manuelles Tracking? Unsere Pilots starten kostenfrei.',
  },
  {
    q: 'Zu viel zu tun',
    a: 'Genau deshalb gebaut — Setup < 2 h, danach sparen Sie Zeit statt verlieren. Wann wäre 30 Min für einen Test?',
  },
  {
    q: 'Schicken Sie erstmal Infos',
    a: 'Mache ich. Was ist Ihr wichtigstes Kriterium? Dann schicke ich Ihnen gezielt das Relevanteste.',
  },
  {
    q: 'Referenzen?',
    a: 'Wir haben aktive Pilots in Ihrer Branche. Kann ich Sie mit einem vernetzen?',
  },
  {
    q: 'Können wir selbst bauen',
    a: 'Wie lange hat Ihr Team für ähnliche Projekte gebraucht? Wir haben das in 6 Monaten gebaut.',
  },
  {
    q: 'Nutzen schon XYZ',
    a: 'Was schätzen Sie daran? Was nervt am meisten? Oft ergänzen wir XYZ statt es zu ersetzen.',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return 'heute';
  if (days === 1) return 'gestern';
  return `vor ${days}d`;
}

// ── KI-Analyse Panel ──────────────────────────────────────────────────────────

function KIPanel({ insights }: { insights: SalesCompanyInsights | null }) {
  const signal = insights?.buying_signal ?? 'unknown';
  const hasData = insights && (
    (insights.pain_points?.length ?? 0) > 0 ||
    (insights.interests?.length ?? 0) > 0 ||
    (insights.software_used?.length ?? 0) > 0 ||
    insights.notes ||
    insights.employee_count != null
  );

  return (
    <div className="sales-ki-panel">
      <div className="sales-ki-header">
        <span className="sales-ki-title">KI-Analyse</span>
        {insights?.last_analyzed_at && (
          <span className="sales-ki-ts">Stand: {insights.last_analyzed_at.slice(0, 10)}</span>
        )}
        {signal !== 'unknown' && (
          <span className={`sales-ki-signal signal-${signal}`}>
            {signal === 'hot' ? '🔥' : signal === 'warm' ? '🌡' : '❄️'} {SIGNAL_LABEL[signal]}
          </span>
        )}
      </div>
      {!hasData ? (
        <p className="sales-ki-empty">
          {!insights
            ? 'Noch keine Analyse — Notion-Checkbox setzen um erstes Transkript zu importieren.'
            : 'Zu wenig Gesprächsdaten für eine Auswertung.'}
        </p>
      ) : (
        <div className="sales-ki-grid">
          {insights.employee_count != null && (
            <div className="sales-ki-item">
              <span className="sales-ki-label">Mitarbeiter</span>
              <strong className="sales-ki-value">{insights.employee_count}</strong>
            </div>
          )}
          {(insights.pain_points?.length ?? 0) > 0 && (
            <div className="sales-ki-item sales-ki-full">
              <span className="sales-ki-label">Pain Points</span>
              <div className="sales-tag-row">
                {insights!.pain_points.map((s) => (
                  <span key={s} className="sales-badge tone-warn">{s}</span>
                ))}
              </div>
            </div>
          )}
          {(insights.interests?.length ?? 0) > 0 && (
            <div className="sales-ki-item sales-ki-full">
              <span className="sales-ki-label">Interessen</span>
              <div className="sales-tag-row">
                {insights!.interests.map((s) => (
                  <span key={s} className="sales-badge tone-brand">{s}</span>
                ))}
              </div>
            </div>
          )}
          {(insights.software_used?.length ?? 0) > 0 && (
            <div className="sales-ki-item sales-ki-full">
              <span className="sales-ki-label">Aktuelle Software</span>
              <div className="sales-tag-row">
                {insights!.software_used.map((s) => (
                  <span key={s} className="sales-badge tone-neutral">{s}</span>
                ))}
              </div>
            </div>
          )}
          {insights.notes && (
            <div className="sales-ki-item sales-ki-full">
              <span className="sales-ki-label">Notiz</span>
              <p className="sales-ki-notes">{insights.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Transcript Modal ───────────────────────────────────────────────────────────

function TranscriptModal({ activity, onClose }: { activity: SalesActivity; onClose: () => void }) {
  const meta = activity.meta as Record<string, string>;
  const kt = meta?.key_takeaways;
  const notionUrl = meta?.notion_url;

  return (
    <div className="sales-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={activity.title}>
      <div className="sales-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sales-modal-header">
          <div>
            <span className="sales-ki-label">{activity.occurred_at.slice(0, 10)}</span>
            <h3 className="sales-modal-title">{activity.title}</h3>
          </div>
          <button type="button" className="sales-modal-close" onClick={onClose} aria-label="Schließen">✕</button>
        </div>
        <div className="sales-modal-body">
          {activity.summary && (
            <div className="sales-modal-section">
              <span className="sales-ki-label">Zusammenfassung</span>
              <p className="sales-modal-text">{activity.summary}</p>
            </div>
          )}
          {kt && (
            <div className="sales-modal-section">
              <span className="sales-ki-label">Key Takeaways</span>
              <pre className="sales-tx-pre">{kt}</pre>
            </div>
          )}
          {!activity.summary && !kt && (
            <p className="sales-muted">Keine weiteren Inhalte gespeichert.</p>
          )}
        </div>
        {notionUrl && (
          <div className="sales-modal-footer">
            <a href={notionUrl} target="_blank" rel="noreferrer" className="sales-notion-link">
              In Notion öffnen →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Objection Drawer ──────────────────────────────────────────────────────────

function ObjectionDrawer({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="obj-drawer" role="complementary" aria-label="Einwand-Bibliothek">
      <div className="obj-drawer-head">
        <span className="obj-drawer-title">Einwände</span>
        <button type="button" className="ccs-close-btn" onClick={onClose} aria-label="Schließen">✕</button>
      </div>
      <ul className="obj-list">
        {OBJECTIONS.map((o, i) => (
          <li key={i} className="obj-item">
            <button
              type="button"
              className={`obj-q${open === i ? ' is-open' : ''}`}
              onClick={() => setOpen(open === i ? null : i)}
            >
              {o.q}
            </button>
            {open === i && <p className="obj-a">{o.a}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Stage Funnel (Pipeline Header) ────────────────────────────────────────────

const FUNNEL_STAGES: SalesStage[] = ['prospecting', 'discovery', 'evaluation', 'pilot', 'customer'];

function StageFunnel({
  companies,
  activeStage,
  onStageClick,
}: {
  companies: SalesCompanyListItem[];
  activeStage: SalesStage | null;
  onStageClick: (s: SalesStage | null) => void;
}) {
  const counts = FUNNEL_STAGES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = companies.filter((c) => c.stage === s).length;
    return acc;
  }, {});
  return (
    <div className="sf-funnel" role="tablist" aria-label="Sales-Funnel">
      {FUNNEL_STAGES.map((s, i) => (
        <button
          key={s}
          role="tab"
          type="button"
          aria-selected={activeStage === s}
          className={`sf-stage${activeStage === s ? ' is-active' : ''} ${STAGE_CLASS[s]}`}
          onClick={() => onStageClick(activeStage === s ? null : s)}
        >
          {i > 0 && <span className="sf-arrow" aria-hidden="true">›</span>}
          <span className="sf-count">{counts[s]}</span>
          <span className="sf-label">{STAGE_LABELS[s]}</span>
        </button>
      ))}
    </div>
  );
}

// ── Pipeline Kanban ───────────────────────────────────────────────────────────

function PipelineCard({ company, memberId }: { company: SalesCompanyListItem; memberId: string }) {
  const ins = company.insights_json;
  const signal = ins?.buying_signal;
  const daysSince = company.days_since_contact;
  return (
    <Link href={`/dashboard/sales?member=${memberId}&company=${company.id}`} className="pp-card">
      <div className="pp-card-head">
        <strong className="pp-card-name">{company.name}</strong>
        {signal && signal !== 'unknown' && (
          <span className={`pp-signal signal-${signal}`}>
            {signal === 'hot' ? '🔥' : signal === 'warm' ? '🌡' : '❄️'}
          </span>
        )}
      </div>
      {company.industry && <span className="pp-meta">{company.industry}</span>}
      <div className="pp-badges">
        {company.transcript_count > 0 && (
          <span className="sales-tx-badge">{company.transcript_count} TX</span>
        )}
        {daysSince !== null && (
          <span className={`sales-days-badge${daysSince >= 14 ? ' tone-warn' : ''}`}>
            {daysSince === 0 ? 'heute' : `${daysSince}d`}
          </span>
        )}
        {company.cold_streak > 1 && (
          <span className="sales-badge tone-danger" title={`${company.cold_streak}× kein Anschluss`}>
            {company.cold_streak}× kalt
          </span>
        )}
      </div>
      {ins?.employee_count != null && <span className="pp-employees">{ins.employee_count} MA</span>}
      {(ins?.software_used?.length ?? 0) > 0 && (
        <span className="pp-software">{ins!.software_used.slice(0, 2).join(', ')}</span>
      )}
      {company.next_step && <span className="pp-nextstep">→ {company.next_step}</span>}
    </Link>
  );
}

function PipelineKanban({ companies, memberId }: { companies: SalesCompanyListItem[]; memberId: string }) {
  const cols = PIPELINE_STAGES.map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    items: companies.filter((c) => c.stage === stage),
  }));

  return (
    <div className="pp-pipeline">
      {cols.map((col) => (
        <div key={col.stage} className={`pp-col ${STAGE_CLASS[col.stage]}`}>
          <div className="pp-col-head">
            <span className="pp-col-title">{col.label}</span>
            <span className="pp-col-count">{col.items.length}</span>
          </div>
          <div className="pp-col-cards">
            {col.items.length === 0 ? (
              <p className="pp-empty">—</p>
            ) : (
              col.items.map((c) => <PipelineCard key={c.id} company={c} memberId={memberId} />)
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Cold Call Session ─────────────────────────────────────────────────────────

const CALL_OUTCOMES = [
  { value: 'reached',      label: 'Erreicht',         cls: 'ccs-outcome-reached' },
  { value: 'voicemail',    label: 'Voicemail',         cls: 'ccs-outcome-voicemail' },
  { value: 'no_answer',    label: 'Kein Anschluss',    cls: 'ccs-outcome-miss' },
  { value: 'not_interested', label: 'Kein Interesse',  cls: 'ccs-outcome-reject' },
  { value: 'appointment',  label: 'Termin vereinbart', cls: 'ccs-outcome-appt' },
];

function buildCcsQueue(companies: SalesCompanyListItem[]): SalesCompanyListItem[] {
  const eligible = companies.filter(
    (c) => c.stage !== 'customer' && c.stage !== 'disqualified' && c.stage !== 'pilot',
  );
  // Tier 1: next_step present + last contact >= 3d (overdue)
  const t1 = eligible.filter((c) => c.next_step && (c.days_since_contact === null || c.days_since_contact >= 3));
  // Tier 2: discovery/evaluation + 7–21 days since contact
  const t2 = eligible.filter(
    (c) => !t1.includes(c) &&
      (c.stage === 'discovery' || c.stage === 'evaluation') &&
      c.days_since_contact !== null && c.days_since_contact >= 7,
  );
  // Tier 3: everything else not recently contacted
  const t3 = eligible.filter(
    (c) => !t1.includes(c) && !t2.includes(c) &&
      (c.days_since_contact === null || c.days_since_contact >= 3),
  );
  return [...t1, ...t2, ...t3];
}

function CcsPreCallBrief({
  company,
  memberId,
}: {
  company: SalesCompanyListItem;
  memberId: string;
}) {
  const [briefText, setBriefText] = useState<string | null>(company.ai_summary);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch(`/api/sales/companies/${company.id}/brief?memberId=${memberId}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.summary) setBriefText(data.summary);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ccs-brief">
      <div className="ccs-brief-head">
        <span className="ccs-brief-title">Pre-Call Brief</span>
        <button
          type="button"
          className="ccs-brief-gen-btn"
          onClick={generate}
          disabled={loading}
        >
          {loading ? '…' : briefText ? '↻' : 'Generieren'}
        </button>
      </div>
      {briefText ? (
        <p className="ccs-brief-text">{briefText}</p>
      ) : (
        <p className="ccs-brief-empty">Klick &quot;Generieren&quot; für KI-Zusammenfassung.</p>
      )}
      {/* Last 3 activities */}
    </div>
  );
}

function ColdCallSession({
  queue,
  memberId,
  onClose,
}: {
  queue: SalesCompanyListItem[];
  memberId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState('reached');
  const [nextStepNote, setNextStepNote] = useState('');
  const [logging, setLogging] = useState(false);
  const [showObjDrawer, setShowObjDrawer] = useState(false);
  const [stats, setStats] = useState({
    reached: 0, voicemail: 0, no_answer: 0, not_interested: 0, appointment: 0, skipped: 0,
  });

  const current = queue[index];
  const done = !current || index >= queue.length;

  async function logAndNext() {
    if (!current || logging) return;
    setLogging(true);
    try {
      const ns =
        nextStepNote.trim() ||
        (outcome === 'appointment' ? 'Termin vorbereiten' :
         outcome === 'reached' ? 'Follow-up planen' :
         (outcome === 'voicemail' || outcome === 'no_answer') ? 'Nochmal anrufen' : undefined);

      await fetch('/api/sales/activities/log-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: current.id, notes: notes || undefined, outcome, next_step: ns }),
      });
      setStats((prev) => ({ ...prev, [outcome as keyof typeof prev]: (prev[outcome as keyof typeof prev] ?? 0) + 1 }));
      advance();
    } finally {
      setLogging(false);
    }
  }

  function advance() {
    setNotes('');
    setNextStepNote('');
    setOutcome('reached');
    setIndex((i) => i + 1);
  }

  function skip() {
    setStats((s) => ({ ...s, skipped: s.skipped + 1 }));
    advance();
  }

  function handleClose() { router.refresh(); onClose(); }

  const total = stats.reached + stats.voicemail + stats.no_answer + stats.not_interested + stats.appointment;

  if (done) {
    return (
      <div className="ccs-overlay" role="dialog" aria-modal="true">
        <div className="ccs-modal ccs-done">
          <div className="ccs-done-icon">✓</div>
          <h2 className="ccs-done-title">Session abgeschlossen</h2>
          <div className="ccs-done-stats">
            <div className="ccs-stat"><span className="ccs-stat-num ccs-reached">{stats.reached}</span><span className="ccs-stat-lbl">Erreicht</span></div>
            <div className="ccs-stat"><span className="ccs-stat-num ccs-appt">{stats.appointment}</span><span className="ccs-stat-lbl">Termine</span></div>
            <div className="ccs-stat"><span className="ccs-stat-num">{stats.voicemail}</span><span className="ccs-stat-lbl">Voicemail</span></div>
            <div className="ccs-stat"><span className="ccs-stat-num">{stats.no_answer}</span><span className="ccs-stat-lbl">Kein Anschluss</span></div>
            <div className="ccs-stat"><span className="ccs-stat-num">{stats.not_interested}</span><span className="ccs-stat-lbl">Kein Interesse</span></div>
          </div>
          <p className="ccs-done-rate">{total > 0 ? `Erreichquote: ${Math.round(((stats.reached + stats.appointment) / total) * 100)} %` : ''}</p>
          <button type="button" className="sales-btn" onClick={handleClose}>Fertig</button>
        </div>
      </div>
    );
  }

  const ins = current.insights_json;
  const signal = ins?.buying_signal;

  return (
    <div className="ccs-overlay" role="dialog" aria-modal="true">
      <div className={`ccs-modal${showObjDrawer ? ' ccs-modal-split' : ''}`}>
        {/* Main call panel */}
        <div className="ccs-main">
          {/* Progress bar */}
          <div className="ccs-topbar">
            <div className="ccs-progress-wrap">
              <div className="ccs-progress-bar" style={{ width: `${(index / queue.length) * 100}%` }} />
            </div>
            <div className="ccs-topbar-meta">
              <span className="ccs-counter">{index + 1} / {queue.length}</span>
              <div className="ccs-mini-stats">
                <span className="ccs-reached">✓ {stats.reached + stats.appointment}</span>
                <span>📞 {stats.voicemail}</span>
                <span>✗ {stats.no_answer}</span>
              </div>
              <button
                type="button"
                className={`ccs-obj-btn${showObjDrawer ? ' is-active' : ''}`}
                onClick={() => setShowObjDrawer((v) => !v)}
                title="Einwand-Bibliothek"
              >
                Einwände
              </button>
              <button type="button" className="ccs-close-btn" onClick={handleClose} aria-label="Session beenden">✕</button>
            </div>
          </div>

          {/* Company info */}
          <div className="ccs-company">
            <div className="ccs-company-head">
              <h2 className="ccs-company-name">{current.name}</h2>
              <span className={`sales-stage-badge ${STAGE_CLASS[current.stage]}`}>
                {STAGE_LABELS[current.stage]}
              </span>
              {signal && signal !== 'unknown' && (
                <span className={`sales-ki-signal signal-${signal}`}>
                  {signal === 'hot' ? '🔥' : signal === 'warm' ? '🌡' : '❄️'} {SIGNAL_LABEL[signal]}
                </span>
              )}
            </div>
            <p className="ccs-company-meta">
              {current.industry}
              {current.days_since_contact !== null
                ? ` · letzter Kontakt vor ${current.days_since_contact}d`
                : ' · noch kein Kontakt'}
              {current.cold_streak > 0 && (
                <span className="ccs-streak-badge"> · {current.cold_streak}× kalt</span>
              )}
            </p>
            {current.first_phone && (
              <a href={`tel:${current.first_phone}`} className="ccs-phone-link">
                📞 {current.first_phone}{current.first_phone_channel === 'mobile' ? ' (Mobil)' : ''}
              </a>
            )}
            {current.next_step && <div className="ccs-next-step">→ {current.next_step}</div>}
            {ins && (
              <div className="ccs-insights-row">
                {ins.employee_count != null && (
                  <span className="ccs-insight-chip">{ins.employee_count} MA</span>
                )}
                {(ins.software_used?.length ?? 0) > 0 && (
                  <span className="ccs-insight-chip ccs-software">{ins.software_used.slice(0, 2).join(', ')}</span>
                )}
                {(ins.pain_points?.length ?? 0) > 0 && (
                  <span className="ccs-insight-chip ccs-pain">{ins.pain_points[0]}</span>
                )}
              </div>
            )}
            {current.transcript_count > 0 && (
              <Link
                href={`/dashboard/sales?member=${memberId}&company=${current.id}`}
                target="_blank"
                className="ccs-open-link"
              >
                {current.transcript_count} Gespräch{current.transcript_count > 1 ? 'e' : ''} · Detail öffnen →
              </Link>
            )}
          </div>

          {/* Pre-Call Brief */}
          <CcsPreCallBrief company={current} memberId={memberId} />

          {/* Outcome buttons */}
          <div className="ccs-outcomes">
            {CALL_OUTCOMES.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`ccs-outcome-btn ${o.cls}${outcome === o.value ? ' is-active' : ''}`}
                onClick={() => {
                  setOutcome(o.value);
                  if ((o.value === 'voicemail' || o.value === 'no_answer') && !nextStepNote) {
                    setNextStepNote('Nochmal anrufen');
                  } else if (o.value === 'appointment' && !nextStepNote) {
                    setNextStepNote('Termin vorbereiten');
                  } else if (nextStepNote === 'Nochmal anrufen' && o.value !== 'voicemail' && o.value !== 'no_answer') {
                    setNextStepNote('');
                  }
                }}
              >
                {o.label}
              </button>
            ))}
          </div>

          {/* Notes */}
          <textarea
            className="sales-input sales-textarea ccs-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Gesprächsnotizen (optional)…"
            rows={2}
          />

          {/* Next step */}
          <input
            className="sales-input ccs-nextstep"
            value={nextStepNote}
            onChange={(e) => setNextStepNote(e.target.value)}
            placeholder="Nächster Schritt…"
          />

          {/* Actions */}
          <div className="ccs-actions">
            <button type="button" className="ccs-skip-btn" onClick={skip}>Überspringen</button>
            <button type="button" className="ccs-save-btn" onClick={logAndNext} disabled={logging}>
              {logging ? 'Speichert…' : 'Speichern & Weiter →'}
            </button>
          </div>
        </div>

        {/* Objection Drawer (side panel) */}
        {showObjDrawer && (
          <ObjectionDrawer onClose={() => setShowObjDrawer(false)} />
        )}
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

type DetailTab = 'gespräche' | 'aktivitäten' | 'summary';
type FilterKey = 'all' | 'call' | 'discovery' | 'evaluation' | 'pilot' | 'hot';

export function SalesDashboard({
  memberId,
  companies,
  selected,
}: {
  memberId: string;
  companies: SalesCompanyListItem[];
  selected: SalesCompanyDetail | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'leads' | 'pipeline'>('leads');
  const [nextStep, setNextStep] = useState(selected?.next_step ?? '');
  const [showContactForm, setShowContactForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [calling, setCalling] = useState<string | null>(null);
  const [showLogCall, setShowLogCall] = useState(false);
  const [callNotes, setCallNotes] = useState('');
  const [callOutcome, setCallOutcome] = useState('reached');
  const [callDurationMin, setCallDurationMin] = useState('');
  const [callNextStep, setCallNextStep] = useState('');
  const [loggingCall, setLoggingCall] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('gespräche');
  const [modalActivity, setModalActivity] = useState<SalesActivity | null>(null);
  const [showCallDropdown, setShowCallDropdown] = useState(false);
  const [showColdCall, setShowColdCall] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [settingStage, setSettingStage] = useState(false);
  const [pipelineStage, setPipelineStage] = useState<SalesStage | null>(null);
  // AI summary state (separate from DB value so we can update inline)
  const [briefText, setBriefText] = useState<string | null>(selected?.ai_summary ?? null);
  const [briefLoading, setBriefLoading] = useState(false);

  // Sync state when selected company changes
  const selectedStage = selected?.stage ?? 'prospecting';

  async function setStage(stage: SalesStage) {
    if (!selected || settingStage) return;
    setSettingStage(true);
    await fetch(`/api/sales/companies/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage }),
    });
    setSettingStage(false);
    router.refresh();
  }

  async function generateBrief() {
    if (!selected || briefLoading) return;
    setBriefLoading(true);
    try {
      const res = await fetch(`/api/sales/companies/${selected.id}/brief?memberId=${memberId}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.summary) setBriefText(data.summary);
    } finally {
      setBriefLoading(false);
    }
  }

  async function logCall() {
    if (!selected || loggingCall) return;
    setLoggingCall(true);
    try {
      const ns = callNextStep.trim() ||
        (callOutcome === 'voicemail' || callOutcome === 'no_answer' ? 'Nochmal anrufen' : undefined);
      const res = await fetch('/api/sales/activities/log-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selected.id,
          notes: callNotes || undefined,
          outcome: callOutcome,
          duration_min: callDurationMin ? Number(callDurationMin) : undefined,
          next_step: ns,
        }),
      });
      const data = await res.json();
      if (!data.ok) { alert(`Fehler: ${data.error}`); return; }
      setCallNotes('');
      setCallDurationMin('');
      setCallNextStep('');
      setCallOutcome('reached');
      setShowLogCall(false);
      if (ns) setNextStep(ns);
      router.refresh();
    } finally {
      setLoggingCall(false);
    }
  }

  async function initiateCall(ep: SalesEndpoint) {
    if (!selected || calling) return;
    setCalling(ep.id);
    setShowCallDropdown(false);
    try {
      const res = await fetch('/api/sales/telephony/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpointId: ep.id, companyId: selected.id }),
      });
      const data = await res.json();
      if (!data.ok) alert(`Call fehlgeschlagen: ${data.error}`);
      else router.refresh();
    } finally {
      setCalling(null);
    }
  }

  async function saveNextStep() {
    if (!selected) return;
    setSaving(true);
    await fetch(`/api/sales/companies/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ next_step: nextStep || null }),
    });
    setSaving(false);
    router.refresh();
  }

  // Computed list item for selected company (relationship_health etc.)
  const selectedListItem = selected ? companies.find((c) => c.id === selected.id) : null;

  // Filter tabs
  const coldCallQueue = buildCcsQueue(companies);

  const FILTER_TABS: { key: FilterKey; label: string; count: number }[] = [
    { key: 'all',       label: 'Alle',            count: companies.length },
    { key: 'call',      label: 'Anrufen',          count: coldCallQueue.length },
    { key: 'discovery', label: 'Erstgespräch',     count: companies.filter((c) => c.stage === 'discovery').length },
    { key: 'evaluation',label: 'Evaluation',       count: companies.filter((c) => c.stage === 'evaluation').length },
    { key: 'pilot',     label: 'Pilots',           count: companies.filter((c) => c.stage === 'pilot').length },
    { key: 'hot',       label: '🔥 Hot',           count: companies.filter((c) => c.insights_json?.buying_signal === 'hot').length },
  ];

  const filtered = companies.filter((c) => {
    if (query && !c.name.toLowerCase().includes(query.toLowerCase())) return false;
    if (activeFilter === 'call')       return coldCallQueue.includes(c);
    if (activeFilter === 'discovery')  return c.stage === 'discovery';
    if (activeFilter === 'evaluation') return c.stage === 'evaluation';
    if (activeFilter === 'pilot')      return c.stage === 'pilot';
    if (activeFilter === 'hot')        return c.insights_json?.buying_signal === 'hot';
    return true;
  });

  // Stats
  const stageCounts = FUNNEL_STAGES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = companies.filter((c) => c.stage === s).length;
    return acc;
  }, {});

  const transcripts = selected?.activities.filter((a) => a.activity_type === 'transcript') ?? [];
  const otherActivities = selected?.activities.filter((a) => a.activity_type !== 'transcript' && a.activity_type !== 'sync') ?? [];
  const allActivities = selected?.activities.filter((a) => a.activity_type !== 'sync') ?? [];
  const phoneEndpoints = selected?.endpoints.filter(
    (ep) => (ep.channel === 'phone' || ep.channel === 'mobile') && !ep.do_not_call,
  ) ?? [];

  const health = selectedListItem?.relationship_health;

  // Pipeline view filtered by pipelineStage click
  const pipelineFiltered = pipelineStage
    ? companies.filter((c) => c.stage === pipelineStage)
    : companies;

  return (
    <section className="sales-shell">
      <header>
        <p className="ovr">Sales OS</p>
        <div className="sales-top-row">
          <h1>{view === 'pipeline' ? 'Sales Pipeline' : 'Leads'}</h1>
          <div className="sales-top-actions">
            <div className="sales-pipeline-summary">
              <span className="sales-badge stage-pilot">{stageCounts['pilot'] ?? 0} Pilots</span>
              {(stageCounts['evaluation'] ?? 0) > 0 && (
                <span className="sales-badge stage-evaluation">{stageCounts['evaluation']} Evaluation</span>
              )}
              {(stageCounts['discovery'] ?? 0) > 0 && (
                <span className="sales-badge stage-discovery">{stageCounts['discovery']} Erstgespräch</span>
              )}
            </div>
            <button
              type="button"
              className={`sales-btn${view === 'pipeline' ? ' sales-btn-active' : ''}`}
              onClick={() => setView((v) => v === 'pipeline' ? 'leads' : 'pipeline')}
            >
              {view === 'pipeline' ? '← Leads' : 'Pipeline'}
            </button>
          </div>
        </div>
      </header>

      {/* Stats bar */}
      <div className="sales-stats-bar">
        {FUNNEL_STAGES.map((s) => (
          <div key={s} className="sales-stat-item">
            <span className={`sales-stat-num${s === 'pilot' ? ' sales-stat-highlight-num' : ''}`}>
              {stageCounts[s] ?? 0}
            </span>
            <span className="sales-stat-lbl">{STAGE_LABELS[s]}</span>
          </div>
        ))}
        <div className="sales-stat-item">
          <span className="sales-stat-num">{companies.filter((c) => c.insights_json?.buying_signal === 'hot').length}</span>
          <span className="sales-stat-lbl">Hot 🔥</span>
        </div>
      </div>

      {/* Pipeline View */}
      {view === 'pipeline' && (
        <div className="sf-view">
          <StageFunnel
            companies={companies}
            activeStage={pipelineStage}
            onStageClick={setPipelineStage}
          />
          <PipelineKanban companies={pipelineStage ? pipelineFiltered : companies} memberId={memberId} />
        </div>
      )}

      {/* Leads View */}
      {view === 'leads' && (
        <div className="sales-grid">

          {/* ── Lead List ─────────────────────────────────────────────────────── */}
          <div className="sales-list">
            <div className="sales-list-toolbar">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Suchen…"
                className="sales-search"
              />
              <button
                type="button"
                className="sales-btn sales-kaltakquise-btn"
                onClick={() => setShowColdCall(true)}
                title={`${coldCallQueue.length} Leads in der Queue`}
              >
                Kaltakquise
              </button>
            </div>
            <div className="sales-filter-tabs" role="tablist">
              {FILTER_TABS.map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  type="button"
                  aria-selected={activeFilter === t.key}
                  className={`sales-filter-tab${activeFilter === t.key ? ' is-active' : ''}`}
                  onClick={() => setActiveFilter(t.key)}
                >
                  {t.label}
                  {t.count > 0 && <span className="sales-filter-count">{t.count}</span>}
                </button>
              ))}
            </div>
            {filtered.length === 0 && <p className="sales-muted">Keine Leads gefunden.</p>}
            {filtered.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/sales?member=${memberId}&company=${c.id}`}
                className={`sales-lead-card${selected?.id === c.id ? ' is-active' : ''}${c.priority_score >= 5 ? ' is-urgent' : ''}`}
              >
                <div className="sales-lead-top">
                  <strong>{c.name}</strong>
                  <div className="sales-lead-badges">
                    <span className={`sales-stage-badge-sm ${STAGE_CLASS[c.stage]}`}>
                      {STAGE_LABELS[c.stage]}
                    </span>
                    {c.relationship_health !== 'green' && (
                      <span className={`sales-health-dot health-${c.relationship_health}`} title={c.relationship_health === 'red' ? 'Kein Kontakt > 30d' : 'Kontakt > 14d'} />
                    )}
                    {!c.pilot_status && c.insights_json?.buying_signal && c.insights_json.buying_signal !== 'unknown' && (
                      <span className={`sales-signal-badge signal-${c.insights_json.buying_signal}`}>
                        {c.insights_json.buying_signal === 'hot' ? '🔥' : '🌡'}
                        {SIGNAL_LABEL[c.insights_json.buying_signal]}
                      </span>
                    )}
                    {c.transcript_count > 0 && (
                      <span className="sales-tx-badge" title={`${c.transcript_count} Gespräch${c.transcript_count > 1 ? 'e' : ''}`}>
                        {c.transcript_count} TX
                      </span>
                    )}
                    {c.cold_streak > 1 && (
                      <span className="sales-badge tone-danger" title={`${c.cold_streak}× kein Anschluss`}>
                        {c.cold_streak}×
                      </span>
                    )}
                  </div>
                </div>
                <span className="sales-lead-meta">
                  {c.industry ?? c.status}
                  {c.contact_count > 0 ? ` · ${c.contact_count} Kontakt${c.contact_count > 1 ? 'e' : ''}` : ''}
                  {c.insights_json?.employee_count != null ? ` · ${c.insights_json.employee_count} MA` : ''}
                </span>
                {c.last_activity_at && (
                  <span className="meta">
                    {ACTIVITY_ICON[c.last_activity_type ?? ''] ?? ''} {daysAgo(c.last_activity_at)}
                  </span>
                )}
                {c.next_step && <span className="meta next-step">→ {c.next_step}</span>}
              </Link>
            ))}
          </div>

          {/* ── Detail Panel ──────────────────────────────────────────────────── */}
          <div>
            {!selected ? (
              <p className="sales-muted">Lead auswählen.</p>
            ) : (
              <div className="sales-detail">

                {/* Company header */}
                <div className="sales-detail-header">
                  <div className="sales-company-name-row">
                    <h2>{selected.name}</h2>
                    {health && (
                      <span className={`sales-health-badge health-${health}`} title={
                        health === 'green' ? 'Aktiver Kontakt' :
                        health === 'yellow' ? 'Kontakt > 14 Tage' :
                        'Kein Kontakt > 30 Tage'
                      }>
                        {health === 'green' ? '●' : health === 'yellow' ? '●' : '●'}
                      </span>
                    )}
                  </div>
                  <div className="sales-detail-meta-row">
                    {selected.website ? (
                      <a href={selected.website} target="_blank" rel="noreferrer" className="sales-website-link">
                        {selected.website.replace(/^https?:\/\//, '')}
                      </a>
                    ) : (
                      <span className="sales-muted">{selected.industry ?? selected.status}</span>
                    )}
                    {selectedListItem?.days_since_contact !== null && selectedListItem?.days_since_contact !== undefined && (
                      <span className={`sales-days-badge${(selectedListItem.days_since_contact ?? 0) >= 14 ? ' tone-warn' : ''}`}>
                        {selectedListItem.days_since_contact === 0 ? 'heute' : `vor ${selectedListItem.days_since_contact}d`}
                      </span>
                    )}
                    {selected.cold_streak > 0 && (
                      <span className="sales-badge tone-danger" title="Aufeinanderfolgende Anrufversuche ohne Erfolg">
                        {selected.cold_streak}× kalt
                      </span>
                    )}
                  </div>

                  {/* Stage Selector */}
                  <div className="sales-stage-row">
                    <select
                      className="sales-stage-select"
                      value={selectedStage}
                      onChange={(e) => setStage(e.target.value as SalesStage)}
                      disabled={settingStage}
                      aria-label="Sales-Stage setzen"
                    >
                      {(Object.keys(STAGE_LABELS) as SalesStage[]).map((s) => (
                        <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                      ))}
                    </select>
                    {settingStage && <span className="sales-muted">…</span>}
                  </div>

                  <div className="sales-header-actions">
                    {phoneEndpoints.length > 0 && (
                      <div className="sales-call-wrap">
                        <button
                          type="button"
                          className="sales-btn sales-call-btn-primary"
                          onClick={() =>
                            phoneEndpoints.length === 1
                              ? initiateCall(phoneEndpoints[0])
                              : setShowCallDropdown((v) => !v)
                          }
                          disabled={calling !== null}
                        >
                          {calling ? 'Verbinde…' : 'Anrufen'}
                        </button>
                        {showCallDropdown && phoneEndpoints.length > 1 && (
                          <div className="sales-call-dropdown">
                            {phoneEndpoints.map((ep) => (
                              <button
                                key={ep.id}
                                type="button"
                                className="sales-call-dropdown-item"
                                onClick={() => initiateCall(ep)}
                              >
                                <span className="sales-badge tone-neutral">{ep.channel}</span>
                                <span>{ep.value}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <button
                      type="button"
                      className="sales-btn sales-log-call-toggle"
                      onClick={() => setShowLogCall((v) => !v)}
                    >
                      {showLogCall ? 'Abbrechen' : 'Call loggen'}
                    </button>
                  </div>
                </div>

                {/* Call log form */}
                {showLogCall && (
                  <section className="sales-section sales-log-call-form">
                    <h3 className="ovr">Call loggen</h3>
                    <div className="sales-log-call-grid">
                      <select
                        className="sales-input"
                        value={callOutcome}
                        onChange={(e) => {
                          setCallOutcome(e.target.value);
                          if (e.target.value === 'voicemail' || e.target.value === 'no_answer') {
                            if (!callNextStep) setCallNextStep('Nochmal anrufen');
                          } else if (callNextStep === 'Nochmal anrufen') {
                            setCallNextStep('');
                          }
                        }}
                      >
                        <option value="reached">Erreicht</option>
                        <option value="voicemail">Voicemail</option>
                        <option value="no_answer">Kein Anschluss</option>
                        <option value="busy">Besetzt</option>
                        <option value="not_interested">Kein Interesse</option>
                        <option value="appointment">Termin vereinbart</option>
                      </select>
                      <input
                        type="number"
                        className="sales-input sales-input-duration"
                        placeholder="Dauer (Min)"
                        value={callDurationMin}
                        onChange={(e) => setCallDurationMin(e.target.value)}
                        min={1}
                      />
                    </div>
                    <textarea
                      className="sales-input sales-textarea"
                      placeholder="Notizen…"
                      value={callNotes}
                      onChange={(e) => setCallNotes(e.target.value)}
                      rows={3}
                    />
                    <div className="sales-row">
                      <input
                        className="sales-input"
                        placeholder="Nächster Schritt (optional)"
                        value={callNextStep}
                        onChange={(e) => setCallNextStep(e.target.value)}
                      />
                      <button type="button" className="sales-btn" onClick={logCall} disabled={loggingCall}>
                        {loggingCall ? 'Speichert…' : 'Speichern'}
                      </button>
                    </div>
                  </section>
                )}

                {/* KI-Analyse */}
                <KIPanel insights={selected.insights_json ?? null} />

                {/* Next Step + Contacts */}
                <div className="sales-detail-cols">
                  <section className="sales-section">
                    <h3 className="ovr">Nächster Schritt</h3>
                    <div className="sales-row">
                      <input
                        value={nextStep}
                        onChange={(e) => setNextStep(e.target.value)}
                        placeholder="z. B. Freitag 10:00 Rückruf"
                        className="sales-input"
                      />
                      <button type="button" onClick={saveNextStep} disabled={saving} className="sales-btn">
                        {saving ? '…' : 'OK'}
                      </button>
                    </div>
                  </section>

                  <section className="sales-section">
                    <div className="sales-section-head">
                      <h3 className="ovr">Kontakte</h3>
                      <button
                        type="button"
                        onClick={() => setShowContactForm((v) => !v)}
                        className="sales-btn sales-btn-sm"
                      >
                        + Kontakt
                      </button>
                    </div>
                    {showContactForm && (
                      <ContactForm
                        companyId={selected.id}
                        onDone={() => { setShowContactForm(false); router.refresh(); }}
                      />
                    )}
                    {selected.contacts.map((ct) => (
                      <div key={ct.id} className="sales-contact">
                        <span>{ct.first_name} {ct.last_name}</span>
                        {ct.role ? <span className="role"> · {ct.role}</span> : null}
                        {ct.email ? <span className="role"> · {ct.email}</span> : null}
                        {!ct.recording_consent && (
                          <span className="sales-badge tone-warn">kein Consent</span>
                        )}
                      </div>
                    ))}
                    {selected.contacts.length === 0 && <p className="sales-muted">—</p>}
                  </section>
                </div>

                {/* Endpoints */}
                {selected.endpoints.length > 0 && (
                  <section className="sales-section">
                    <h3 className="ovr">Endpoints</h3>
                    {selected.endpoints.map((ep) => (
                      <div key={ep.id} className="sales-endpoint-row">
                        <span className="sales-badge tone-neutral">{ep.channel}</span>
                        <span>{ep.value}</span>
                        <span className="meta">{ep.endpoint_type} · {ep.validity_status}</span>
                        {ep.do_not_call && <span className="sales-badge tone-danger">DNC</span>}
                      </div>
                    ))}
                  </section>
                )}

                {/* Tabs */}
                <div className="sales-tabs">
                  <button
                    type="button"
                    className={`sales-tab${activeTab === 'gespräche' ? ' is-active' : ''}`}
                    onClick={() => setActiveTab('gespräche')}
                  >
                    Gespräche{transcripts.length > 0 ? ` (${transcripts.length})` : ''}
                  </button>
                  <button
                    type="button"
                    className={`sales-tab${activeTab === 'aktivitäten' ? ' is-active' : ''}`}
                    onClick={() => setActiveTab('aktivitäten')}
                  >
                    Aktivitäten{otherActivities.length > 0 ? ` (${otherActivities.length})` : ''}
                  </button>
                  <button
                    type="button"
                    className={`sales-tab${activeTab === 'summary' ? ' is-active' : ''}`}
                    onClick={() => setActiveTab('summary')}
                  >
                    KI-Brief
                  </button>
                </div>

                {/* Tab: Gespräche */}
                {activeTab === 'gespräche' && (
                  transcripts.length === 0 ? (
                    <p className="sales-muted">Noch keine Gespräche.</p>
                  ) : (
                    <ol className="sales-timeline">
                      {transcripts.map((a) => {
                        const kt = (a.meta as Record<string, string>)?.key_takeaways;
                        const preview = a.summary ?? kt ?? '';
                        return (
                          <li
                            key={a.id}
                            className="sales-transcript-card"
                            onClick={() => setModalActivity(a)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => e.key === 'Enter' && setModalActivity(a)}
                          >
                            <div className="sales-tx-header">
                              <span className="meta">{a.occurred_at.slice(0, 10)}</span>
                              <span className="title">{a.title}</span>
                              <span className="sales-tx-toggle">→</span>
                            </div>
                            {preview && (
                              <p className="summary sales-tx-preview">
                                {preview.slice(0, 220)}{preview.length > 220 ? '…' : ''}
                              </p>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  )
                )}

                {/* Tab: Aktivitäten (unified) */}
                {activeTab === 'aktivitäten' && (
                  <ol className="sales-timeline">
                    {allActivities.map((a) => (
                      <li key={a.id} className="sales-activity-item">
                        <div className="sales-activity-meta">
                          <span className="sales-activity-icon" aria-hidden="true">
                            {ACTIVITY_ICON[a.activity_type] ?? '·'}
                          </span>
                          <span className="meta">{a.occurred_at.slice(0, 10)}</span>
                          <span className="meta sales-activity-dir">
                            {a.direction === 'inbound' ? '↙' : a.direction === 'outbound' ? '↗' : ''}
                          </span>
                        </div>
                        <div className="title">{a.title}</div>
                        {a.summary && <p className="summary">{a.summary.slice(0, 300)}{a.summary.length > 300 ? '…' : ''}</p>}
                      </li>
                    ))}
                    {allActivities.length === 0 && <p className="sales-muted">—</p>}
                  </ol>
                )}

                {/* Tab: KI-Brief */}
                {activeTab === 'summary' && (
                  <div className="sales-brief-section">
                    <div className="sales-brief-head">
                      <span className="sales-ki-label">KI-Zusammenfassung</span>
                      <button
                        type="button"
                        className="sales-btn sales-btn-sm"
                        onClick={generateBrief}
                        disabled={briefLoading}
                      >
                        {briefLoading ? '…' : briefText ? '↻ Aktualisieren' : '✦ Generieren'}
                      </button>
                    </div>
                    {briefText ? (
                      <p className="sales-brief-text">{briefText}</p>
                    ) : (
                      <p className="sales-muted">
                        Klick &ldquo;Generieren&rdquo; für eine KI-Zusammenfassung basierend auf allen Aktivitäten.
                      </p>
                    )}
                  </div>
                )}

              </div>
            )}
          </div>
        </div>
      )}

      {/* Cold Call Session Modal */}
      {showColdCall && (
        <ColdCallSession
          queue={coldCallQueue}
          memberId={memberId}
          onClose={() => setShowColdCall(false)}
        />
      )}

      {/* Transcript popup modal */}
      {modalActivity && (
        <TranscriptModal
          activity={modalActivity}
          onClose={() => setModalActivity(null)}
        />
      )}
    </section>
  );
}

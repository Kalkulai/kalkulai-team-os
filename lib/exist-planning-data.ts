import type { PlanningData, PlanningItem } from '@/types/exist-planning';

// PLATZHALTER-DATEN — mit echten Zeilen aus v12-Spreadsheets ersetzen.
// Sachmittel gesamt: 30.000 €  |  Coaching gesamt: 5.000 €
const ITEMS: PlanningItem[] = [
  // ── Sachmittel ───────────────────────────────────────────────────────
  {
    id: 'sm-cloud',
    name: 'Cloud-Infrastruktur & API-Credits',
    category: 'sachmittel',
    start: '2026-08',
    end: '2027-07',
    amount_eur_total: 15_000,
    description: 'Hetzner, OpenAI, Azure — monatliche Abonnements',
  },
  {
    id: 'sm-lizenzen',
    name: 'Software-Lizenzen (SaaS)',
    category: 'sachmittel',
    start: '2026-08',
    end: '2027-07',
    amount_eur_total: 3_000,
    description: 'Linear, Vercel, sonstige Tool-Abos',
  },
  {
    id: 'sm-hardware',
    name: 'Hardware-Ausstattung',
    category: 'sachmittel',
    start: '2026-08',
    end: '2026-08',
    amount_eur_total: 8_000,
    description: 'Einmaliger Hardware-Kauf bei Programmstart',
  },
  {
    id: 'sm-legal',
    name: 'Zertifizierungen & Rechtsberatung',
    category: 'sachmittel',
    start: '2027-02',
    end: '2027-03',
    amount_eur_total: 4_000,
    description: 'Datenschutz-Audit, ggf. Patentberatung',
  },
  // ── Coaching ─────────────────────────────────────────────────────────
  {
    id: 'co-block1',
    name: 'Mentoring / Coaching Block 1',
    category: 'coaching',
    start: '2026-10',
    end: '2026-11',
    amount_eur_total: 2_500,
    description: 'Gründungsberatung Q4 2026',
  },
  {
    id: 'co-block2',
    name: 'Mentoring / Coaching Block 2',
    category: 'coaching',
    start: '2027-03',
    end: '2027-04',
    amount_eur_total: 2_500,
    description: 'Pitch-Coaching Frühling 2027',
  },
];

export async function loadPlanningData(): Promise<PlanningData> {
  return {
    items: ITEMS,
    funding_start: '2026-08',
    funding_end: '2027-07',
  };
}

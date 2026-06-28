export type PlanningCategory = 'sachmittel' | 'coaching';

// Phase 2: PlanningItemWithStatus = PlanningItem & { status: PlanningStatus }
export type PlanningStatus = 'planned' | 'done' | 'partial';

export interface PlanningItem {
  id: string;
  name: string;
  category: PlanningCategory;
  /** 'YYYY-MM'. Einmalposten: start === end. Block: start < end. */
  start: string;
  end: string;
  amount_eur_total: number;
  description?: string;
}

export interface PlanningData {
  items: PlanningItem[];
  funding_start: string; // 'YYYY-MM'
  funding_end: string;   // 'YYYY-MM'
}

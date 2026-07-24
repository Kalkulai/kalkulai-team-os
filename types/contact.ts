export type ConnectionStrength = 'warm' | 'cold' | 'unknown';

export interface Contact {
  id: string;
  name: string;
  relationship_to_kalkulai: string | null;
  subcategory: string;
  status: string;
  connection_strength: ConnectionStrength | string;
  last_contact_date: string | null;
  next_action: string | null;
  next_action_date: string | null;
  linkedin: string | null;
  email: string | null;
  phone: string | null;
  tags: string[];
  related: string[];
  introduced_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactUpsertInput {
  id: string;
  name: string;
  relationship_to_kalkulai?: string | null;
  subcategory?: string;
  status?: string;
  connection_strength?: ConnectionStrength | string;
  last_contact_date?: string | null;
  next_action?: string | null;
  next_action_date?: string | null;
  linkedin?: string | null;
  email?: string | null;
  phone?: string | null;
  tags?: string[];
  related?: string[];
  introduced_by?: string | null;
}

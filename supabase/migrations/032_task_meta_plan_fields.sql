-- Extend task_meta with team planning fields for /dashboard/plan view.
ALTER TABLE task_meta
  ADD COLUMN IF NOT EXISTS phase smallint CHECK (phase BETWEEN 1 AND 9),
  ADD COLUMN IF NOT EXISTS bereich text CHECK (bereich IN (
    'dashboard','angebot','planung','kommunikation','ma_mobil','allgemein'
  ));

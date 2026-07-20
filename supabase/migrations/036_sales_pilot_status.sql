-- 036: pilot_status per sales company
-- 'active'    = confirmed paying/pilot customer
-- 'committed' = agreed to pilot in a conversation (KI-extracted from transcripts)
ALTER TABLE sales_companies
  ADD COLUMN IF NOT EXISTS pilot_status text
  CHECK (pilot_status IN ('active', 'committed'));

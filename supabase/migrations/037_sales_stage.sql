-- 037_sales_stage.sql
-- Native sales stage (replaces HubSpot lifecycle passthrough as operational stage)
-- pilot_status column stays for insights-extraction backward compat

ALTER TABLE sales_companies
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'prospecting'
    CONSTRAINT sales_companies_stage_check
    CHECK (stage IN (
      'prospecting',
      'discovery',
      'evaluation',
      'pilot',
      'expansion',
      'customer',
      'disqualified'
    ));

ALTER TABLE sales_companies
  ADD COLUMN IF NOT EXISTS stage_entered_at timestamptz DEFAULT now();

ALTER TABLE sales_companies
  ADD COLUMN IF NOT EXISTS ai_summary text;

ALTER TABLE sales_companies
  ADD COLUMN IF NOT EXISTS cold_streak integer NOT NULL DEFAULT 0;

-- Backfill stage from existing pilot_status and HubSpot lifecyclestage
UPDATE sales_companies
SET stage = CASE
  WHEN pilot_status = 'active'    THEN 'pilot'
  WHEN pilot_status = 'committed' THEN 'pilot'
  WHEN status IN ('customer', 'evangelist') THEN 'customer'
  WHEN status IN ('salesqualifiedlead', 'opportunity') THEN 'evaluation'
  WHEN status = 'marketingqualifiedlead' THEN 'discovery'
  WHEN status = 'lead' AND insights_json->>'buying_signal' IN ('hot', 'warm') THEN 'discovery'
  ELSE 'prospecting'
END
WHERE stage = 'prospecting'; -- only touch un-set rows

CREATE INDEX IF NOT EXISTS idx_sales_companies_stage ON sales_companies (stage);
CREATE INDEX IF NOT EXISTS idx_sales_companies_cold_streak ON sales_companies (cold_streak)
  WHERE cold_streak > 0;

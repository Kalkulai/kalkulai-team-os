-- Structured customer insight profiles extracted from conversation transcripts
ALTER TABLE sales_companies ADD COLUMN IF NOT EXISTS insights_json JSONB DEFAULT NULL;

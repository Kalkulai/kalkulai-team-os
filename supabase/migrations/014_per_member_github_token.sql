-- Per-Member GitHub-Token
-- Each user pastes their own Personal Access Token (Classic or Fine-grained)
-- so the dashboard can read THEIR commits/branches/PRs across every repo they
-- touch — including private repos in their own account, not just the org.
--
-- The env-var GITHUB_TOKEN stays as a global fallback for member-agnostic calls
-- (active-branches across REPOS, conflict-checker etc.).
--
-- RLS already denies anon reads on team_members (migration 010). Service-role
-- can read; the public /api/members endpoint strips this field before returning.

alter table team_members
  add column if not exists github_token text,
  add column if not exists github_token_expires_at date;

comment on column team_members.github_token is
  'Personal Access Token used to read this member''s GitHub identity. Never returned via /api/members.';
comment on column team_members.github_token_expires_at is
  'User-entered expiry date (YYYY-MM-DD). Health-cron compares this against now() and warns 14d before.';

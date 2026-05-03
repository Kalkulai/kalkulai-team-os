-- Per-person Google Calendar OAuth tokens. Each member can connect their own
-- calendar via /api/oauth/google/start. Falls back to the global
-- GOOGLE_REFRESH_TOKEN env when a member has not connected.

alter table team_members
  add column if not exists google_refresh_token text;

alter table team_members
  add column if not exists google_calendar_email text;

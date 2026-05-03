alter table team_members
  add column if not exists notion_user_id text;

create table if not exists task_links (
  id uuid primary key default gen_random_uuid(),
  notion_page_id text not null unique,
  linear_issue_id text,
  branch_name text,
  created_at timestamptz default now()
);

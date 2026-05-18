-- Hermes Chat — per-member conversations + messages.
-- One member can have multiple conversations (sidebar history).
-- Messages reference their conversation.
-- Service-role writes (Next.js API-routes); RLS denies anon access.

create table if not exists hermes_conversations (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references team_members(id) on delete cascade,
  title text not null default 'Neue Konversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_hermes_conv_member_updated
  on hermes_conversations(member_id, updated_at desc);

create table if not exists hermes_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references hermes_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_hermes_msg_conv_created
  on hermes_messages(conversation_id, created_at asc);

alter table hermes_conversations enable row level security;
alter table hermes_messages enable row level security;

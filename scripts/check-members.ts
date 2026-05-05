import { config } from 'dotenv';
config({ path: '.env.local' });
import { getAllMembers } from '../lib/supabase';

function flag(v: unknown): string {
  return v ? 'OK' : 'fehlt';
}

async function main() {
  const members = await getAllMembers();
  console.log(`\n${members.length} Teammitglieder:\n`);
  for (const m of members) {
    console.log(`— ${m.name} (${m.role}) — ${m.email}`);
    console.log(`   id:                ${m.id}`);
    console.log(`   linear_user_id:    ${flag(m.linear_user_id)}${m.linear_user_id ? ` (${m.linear_user_id})` : ''}`);
    console.log(`   github_username:   ${flag(m.github_username)}${m.github_username ? ` (${m.github_username})` : ''}`);
    console.log(`   telegram_chat_id:  ${flag(m.telegram_chat_id)}`);
    console.log(`   hubspot_owner_id:  ${flag(m.hubspot_owner_id)}`);
    console.log(`   notion_user_id:    ${flag(m.notion_user_id)}`);
    console.log(`   google_calendar:   ${flag(m.google_refresh_token || m.google_calendar_email)}${m.google_calendar_email ? ` (${m.google_calendar_email})` : ''}`);
    console.log('');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { config } from 'dotenv';
config({ path: '.env.local' });
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Client } from 'pg';

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: npx tsx scripts/apply-migration.ts <migration-file>');
    process.exit(1);
  }

  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error('SUPABASE_DB_URL missing in .env.local');
    process.exit(1);
  }

  const sql = readFileSync(resolve(file), 'utf-8');
  console.log(`Applying ${file} (${sql.length} chars)…`);

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log('✓ Migration applied');
  } catch (e) {
    console.error('✗ Migration failed:', e instanceof Error ? e.message : e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

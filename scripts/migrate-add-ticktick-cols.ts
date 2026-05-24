import postgres from 'postgres';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

if (!process.env.POSTGRES_URL) {
  console.error('❌ POSTGRES_URL is not defined in .env.local');
  process.exit(1);
}

const sql = postgres(process.env.POSTGRES_URL, {
  ssl: process.env.NODE_ENV === 'production' ? 'require' : false,
});

async function runMigration() {
  try {
    console.log('Running migration: add ticktick columns to daily_records…');

    await sql`
      ALTER TABLE daily_records
        ADD COLUMN IF NOT EXISTS focus_minutes_ticktick INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS tasks_completed_ticktick INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS ticktick_synced_at TIMESTAMP
    `;

    console.log('✅ Migration successful.');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
    process.exit(0);
  }
}

runMigration();

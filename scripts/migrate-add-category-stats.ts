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
    console.log('Running migration: create daily_category_stats…');

    await sql`
      CREATE TABLE IF NOT EXISTS daily_category_stats (
        date            DATE NOT NULL REFERENCES daily_records(date) ON DELETE CASCADE,
        category        TEXT NOT NULL CHECK (category IN ('work','study','hustle','life','uncategorized')),
        focus_minutes   INT  NOT NULL DEFAULT 0,
        tasks_completed INT  NOT NULL DEFAULT 0,
        updated_at      TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (date, category)
      )
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

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
    console.log('Running migration: create token_usage table…');

    await sql`
      CREATE TABLE IF NOT EXISTS token_usage (
        date         DATE   NOT NULL,
        tool         TEXT   NOT NULL,
        total_tokens BIGINT NOT NULL DEFAULT 0,
        updated_at   TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (date, tool)
      );
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_token_usage_date ON token_usage(date DESC);
    `;

    console.log('✅ Migration successful: token_usage table ready.');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
    process.exit(0);
  }
}

runMigration();

import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = postgres(process.env.POSTGRES_URL!);

/**
 * Shared client state (task queue order, the running pomodoro). See lib/app-state.ts.
 * Idempotent: safe to run against a database that already has the table.
 */
async function migrate() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS app_state (
        key        TEXT PRIMARY KEY,
        value      JSONB NOT NULL,
        version    BIGINT NOT NULL DEFAULT 1,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    console.log('✅ app_state table ready');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();

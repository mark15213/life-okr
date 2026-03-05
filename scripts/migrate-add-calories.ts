import postgres from 'postgres';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

if (!process.env.POSTGRES_URL) {
    console.error('❌ POSTGRES_URL is not defined in .env.local');
    process.exit(1);
}

const sql = postgres(process.env.POSTGRES_URL);

async function runMigration() {
    try {
        console.log('Running migration: Add calories_burned to daily_records...');

        await sql`
      ALTER TABLE daily_records
      ADD COLUMN IF NOT EXISTS calories_burned INT NOT NULL DEFAULT 0;
    `;

        console.log('✅ Migration successful: Added calories_burned column.');
    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        process.exit(0);
    }
}

runMigration();

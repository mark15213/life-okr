import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = postgres(process.env.POSTGRES_URL!);

async function setupDatabase() {
  try {
    console.log('Creating daily_records table...');

    await sql`
      CREATE TABLE IF NOT EXISTS daily_records (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL UNIQUE,
        cigarettes INT NOT NULL DEFAULT 0,
        exercises INT NOT NULL DEFAULT 0,
        pushup_balance INT NOT NULL DEFAULT 0,
        focus_minutes INT NOT NULL DEFAULT 0,
        tasks_completed INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_daily_records_date ON daily_records(date DESC)
    `;

    console.log('Creating vault_purchases table...');

    await sql`
      CREATE TABLE IF NOT EXISTS vault_purchases (
        id SERIAL PRIMARY KEY,
        item_name VARCHAR NOT NULL,
        cost INT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_vault_purchases_created_at ON vault_purchases(created_at DESC)
    `;

    console.log('✅ Database setup complete!');
  } catch (error) {
    console.error('❌ Error setting up database:', error);
    process.exit(1);
  }
}

setupDatabase();

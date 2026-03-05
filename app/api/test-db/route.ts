import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET() {
  const results: any = {
    timestamp: new Date().toISOString(),
    tests: {},
  };

  // Test 1: Database connection
  try {
    const { rows } = await sql`SELECT NOW() as current_time`;
    results.tests.connection = {
      status: 'success',
      message: 'Database connection successful',
      data: rows[0],
    };
  } catch (error) {
    results.tests.connection = {
      status: 'error',
      message: 'Database connection failed',
      error: error instanceof Error ? error.message : String(error),
    };
    return NextResponse.json(results, { status: 500 });
  }

  // Test 2: Check if table exists
  try {
    const { rows } = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'daily_records'
      ) as table_exists
    `;
    results.tests.tableExists = {
      status: 'success',
      exists: rows[0].table_exists,
      message: rows[0].table_exists
        ? 'Table daily_records exists'
        : 'Table daily_records does NOT exist',
    };
  } catch (error) {
    results.tests.tableExists = {
      status: 'error',
      message: 'Failed to check table existence',
      error: error instanceof Error ? error.message : String(error),
    };
  }

  // Test 3: Try to query the table
  if (results.tests.tableExists?.exists) {
    try {
      const { rows } = await sql`SELECT COUNT(*) as count FROM daily_records`;
      results.tests.queryTable = {
        status: 'success',
        message: 'Successfully queried daily_records table',
        recordCount: rows[0].count,
      };
    } catch (error) {
      results.tests.queryTable = {
        status: 'error',
        message: 'Failed to query daily_records table',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Test 4: Environment variables check
  results.tests.envVars = {
    POSTGRES_URL: process.env.POSTGRES_URL ? '✓ Set' : '✗ Missing',
    POSTGRES_PRISMA_URL: process.env.POSTGRES_PRISMA_URL ? '✓ Set' : '✗ Missing',
    POSTGRES_URL_NON_POOLING: process.env.POSTGRES_URL_NON_POOLING ? '✓ Set' : '✗ Missing',
  };

  return NextResponse.json(results);
}

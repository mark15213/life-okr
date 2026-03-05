import postgres from 'postgres';
import { NextResponse } from 'next/server';

export async function GET() {
  const results: any = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    tests: {},
  };

  // Test 1: Check environment variables
  results.tests.envVars = {
    POSTGRES_URL_exists: !!process.env.POSTGRES_URL,
    POSTGRES_URL_length: process.env.POSTGRES_URL?.length || 0,
    POSTGRES_URL_starts_with: process.env.POSTGRES_URL?.substring(0, 20) || 'undefined',
    POSTGRES_PRISMA_URL_exists: !!process.env.POSTGRES_PRISMA_URL,
    POSTGRES_URL_NON_POOLING_exists: !!process.env.POSTGRES_URL_NON_POOLING,
  };

  // Test 2: Try to initialize Neon client
  try {
    if (!process.env.POSTGRES_URL) {
      results.tests.clientInit = {
        status: 'error',
        message: 'POSTGRES_URL environment variable is not set',
      };
      return NextResponse.json(results, { status: 500 });
    }

    const sql = postgres(process.env.POSTGRES_URL);
    results.tests.clientInit = {
      status: 'success',
      message: 'Neon client initialized successfully',
    };

    // Test 3: Try to connect and query
    try {
      const rows = await sql`SELECT NOW() as current_time, version() as pg_version`;
      results.tests.connection = {
        status: 'success',
        message: 'Database connection successful',
        data: rows[0],
      };
    } catch (error: any) {
      results.tests.connection = {
        status: 'error',
        message: 'Database connection failed',
        error: error.message,
        errorType: error.constructor.name,
        errorStack: error.stack?.split('\n').slice(0, 3),
        cause: error.cause ? String(error.cause) : undefined,
      };
      return NextResponse.json(results, { status: 500 });
    }

    // Test 4: Check if table exists
    try {
      const rows = await sql`
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
    } catch (error: any) {
      results.tests.tableExists = {
        status: 'error',
        message: 'Failed to check table existence',
        error: error.message,
      };
    }

    // Test 5: Try to query the table (if it exists)
    if (results.tests.tableExists?.exists) {
      try {
        const rows = await sql`SELECT COUNT(*) as count FROM daily_records`;
        results.tests.queryTable = {
          status: 'success',
          message: 'Successfully queried daily_records table',
          recordCount: rows[0].count,
        };
      } catch (error: any) {
        results.tests.queryTable = {
          status: 'error',
          message: 'Failed to query daily_records table',
          error: error.message,
        };
      }
    }

  } catch (error: any) {
    results.tests.clientInit = {
      status: 'error',
      message: 'Failed to initialize Neon client',
      error: error.message,
      errorType: error.constructor.name,
    };
    return NextResponse.json(results, { status: 500 });
  }

  return NextResponse.json(results);
}

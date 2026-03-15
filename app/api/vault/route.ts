import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET() {
    try {
        const rows = await sql`
      SELECT * FROM vault_purchases
      ORDER BY created_at DESC
    `;
        return NextResponse.json({ purchases: rows });
    } catch (error) {
        console.error('Error fetching vault purchases:', error);
        return NextResponse.json({ error: 'Failed to fetch vault purchases' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { item_name, cost } = body;

        if (!item_name || typeof item_name !== 'string') {
            return NextResponse.json({ error: 'Invalid item_name' }, { status: 400 });
        }
        if (!cost || typeof cost !== 'number' || cost <= 0) {
            return NextResponse.json({ error: 'Invalid cost' }, { status: 400 });
        }

        const rows = await sql`
      INSERT INTO vault_purchases (item_name, cost)
      VALUES (${item_name}, ${cost})
      RETURNING *
    `;

        return NextResponse.json({ purchase: rows[0] });
    } catch (error) {
        console.error('Error creating vault purchase:', error);
        return NextResponse.json({ error: 'Failed to create vault purchase' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Purchase ID is required' }, { status: 400 });
        }

        const rows = await sql`
      DELETE FROM vault_purchases
      WHERE id = ${id}
      RETURNING *
    `;

        if (rows.length === 0) {
            return NextResponse.json({ error: 'Purchase not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, deleted: rows[0] });
    } catch (error) {
        console.error('Error deleting vault purchase:', error);
        return NextResponse.json({ error: 'Failed to delete vault purchase' }, { status: 500 });
    }
}

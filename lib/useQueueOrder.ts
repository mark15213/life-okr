'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';

/**
 * The one priority order every client shares, held in `app_state` under `queue-order`.
 *
 * TickTick has no notion of "my order", so the dashboard, the desktop client and the iPhone
 * agree on one through this key instead. Dragging a row in the panel's All tab is what the
 * iOS Focus queue reads on its next sync — see ios/Hustle/Focus/FocusStore.swift.
 *
 * Writes are debounced (one drag fires a reorder per row crossed) and carry the version they
 * were based on, so two devices reordering at the same moment cannot silently clobber each
 * other: a stale write comes back 409 with the current row, and ours is re-applied on top once.
 */

const ENDPOINT = '/api/state/queue-order';
const SAVE_DEBOUNCE_MS = 600;

interface StoredOrder {
    value: { order: string[] } | null;
    version: number;
}

export interface QueueOrderHandle {
    /** Task ids, top of the queue first. Null until the first read lands. */
    order: string[] | null;
    saving: boolean;
    error: string | null;
    /** Adopt this order on screen straight away, then push it to the server. */
    save: (ids: string[]) => void;
}

async function fetchOrder(url: string): Promise<StoredOrder> {
    const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) throw new Error('Could not read the saved order');
    return res.json();
}

export function useQueueOrder(enabled: boolean): QueueOrderHandle {
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Revalidation is off: a refocus mid-drag would swap the rows back under the cursor, and
    // the panel re-reads anyway every time it opens (the key flips from null).
    const { data, mutate } = useSWR<StoredOrder>(enabled ? ENDPOINT : null, fetchOrder, {
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
    });

    const versionRef = useRef(0);
    const pendingRef = useRef<string[] | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        // Only while nothing of ours is in flight: mid-save the server's version is the one
        // our own PUT is about to move past, and `flush` keeps that number itself.
        if (data && !pendingRef.current) versionRef.current = data.version ?? 0;
    }, [data]);

    const put = useCallback(
        (ids: string[], ifVersion: number) =>
            fetch(ENDPOINT, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ value: { order: ids }, ifVersion }),
            }),
        []
    );

    const flush = useCallback(async () => {
        const ids = pendingRef.current;
        if (!ids) return;

        setSaving(true);
        try {
            let res = await put(ids, versionRef.current);

            if (res.status === 409) {
                // Another device wrote first. Its version comes back in the body, so ours can
                // go on top without a second round trip to read it.
                const body = await res.json().catch(() => ({}));
                const current = body?.current?.version;
                if (typeof current === 'number') {
                    versionRef.current = current;
                    res = await put(ids, current);
                }
            }

            if (res.ok) {
                const stored = (await res.json()) as StoredOrder;
                versionRef.current = stored.version ?? versionRef.current;
                setError(null);
            } else {
                setError('Could not save the new order — it still applies on this screen.');
            }
        } catch {
            setError('Could not reach the server to save the new order.');
        } finally {
            // Cleared either way: holding it would freeze the version bookkeeping above.
            if (pendingRef.current === ids) pendingRef.current = null;
            setSaving(false);
        }
    }, [put]);

    const save = useCallback(
        (ids: string[]) => {
            pendingRef.current = ids;
            void mutate({ value: { order: ids }, version: versionRef.current }, { revalidate: false });
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
        },
        [flush, mutate]
    );

    useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

    return { order: data ? data.value?.order ?? [] : null, saving, error, save };
}

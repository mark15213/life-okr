'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'life-okr-auth';

export function usePasscode() {
    const [isAuthed, setIsAuthed] = useState(false);

    useEffect(() => {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            // localStorage can be unavailable in private or restricted contexts.
        }

        fetch('/api/auth/session', {
            cache: 'no-store',
            credentials: 'same-origin',
        })
            .then((res) => res.json())
            .then((data) => setIsAuthed(Boolean(data.authenticated)))
            .catch(() => setIsAuthed(false));
    }, []);

    const verify = useCallback(async (code: string): Promise<boolean> => {
        const res = await fetch('/api/auth/unlock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ code }),
        }).catch(() => null);

        if (res?.ok) {
            setIsAuthed(true);
            return true;
        }

        setIsAuthed(false);
        return false;
    }, []);

    return { isAuthed, verify };
}

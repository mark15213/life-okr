'use client';

import { useState, useEffect, useCallback } from 'react';

const PASSCODE = '5566';
const STORAGE_KEY = 'life-okr-auth';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface AuthData {
    token: string;
    expiresAt: number;
}

export function usePasscode() {
    const [isAuthed, setIsAuthed] = useState(false);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const data: AuthData = JSON.parse(stored);
                if (data.token === PASSCODE && data.expiresAt > Date.now()) {
                    setIsAuthed(true);
                } else {
                    localStorage.removeItem(STORAGE_KEY);
                }
            }
        } catch {
            localStorage.removeItem(STORAGE_KEY);
        }
    }, []);

    const verify = useCallback((code: string): boolean => {
        if (code === PASSCODE) {
            const data: AuthData = {
                token: PASSCODE,
                expiresAt: Date.now() + TTL_MS,
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            setIsAuthed(true);
            return true;
        }
        return false;
    }, []);

    return { isAuthed, verify };
}

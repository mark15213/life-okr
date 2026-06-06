import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { DailyRecord } from './db';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function withTicktickSummed<T extends DailyRecord>(r: T): T {
    return {
        ...r,
        focus_minutes: r.focus_minutes + (r.focus_minutes_ticktick ?? 0),
        tasks_completed: r.tasks_completed + (r.tasks_completed_ticktick ?? 0),
    };
}

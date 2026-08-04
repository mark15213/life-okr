/**
 * The timezone the dashboard reasons about days in.
 *
 * Lives alone so there is exactly one of it. Every writer that stamps a `daily_records` row —
 * the manual entry routes, the TickTick sync running on a laptop, the same sync running on
 * Vercel — has to agree on where a day starts, and they do not share a process timezone:
 * Vercel is UTC, the laptop is not. Two definitions drifting apart would put the same
 * activity on different dates and let the writers overwrite each other.
 *
 * Read through `Intl`/`toLocaleDateString`, never through `getHours()` and friends, so the
 * answer does not depend on where the code happens to be running.
 */
export const APP_TZ = process.env.APP_TZ ?? 'Asia/Shanghai';

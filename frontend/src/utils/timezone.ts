/** All times are displayed and entered in Australia/Melbourne time (AEDT/AEST, DST-aware). */

export const APP_TZ = 'Australia/Melbourne';

/**
 * UTC ISO string → Melbourne "YYYY-MM-DDTHH:MM" for use in date/time inputs.
 * Uses the 'sv' locale which produces ISO-like "YYYY-MM-DD HH:MM:SS" format.
 */
export function toMelbourneInput(iso: string): string {
  // sv locale → "YYYY-MM-DD HH:MM:SS"; replace space with T and trim seconds
  return new Date(iso)
    .toLocaleString('sv', { timeZone: APP_TZ })
    .slice(0, 16)
    .replace(' ', 'T'); // → "YYYY-MM-DDTHH:MM"
}

/** Current Melbourne time as "YYYY-MM-DDTHH:MM" for default input values. */
export function nowMelbourne(): string {
  return new Date()
    .toLocaleString('sv', { timeZone: APP_TZ })
    .slice(0, 16)
    .replace(' ', 'T');
}

/**
 * Melbourne "YYYY-MM-DDTHH:MM" → UTC ISO string for the API.
 *
 * Strategy: treat the input string as UTC to get a "naive" timestamp, then
 * find Melbourne's UTC offset at that instant, and subtract it.
 * Works correctly across DST transitions (AEDT UTC+11 ↔ AEST UTC+10).
 */
export function melbourneToUTC(local: string): string {
  if (!local) return '';
  // Step 1: parse the string as if it were UTC
  const naive = new Date(local + ':00Z');
  // Step 2: find Melbourne's offset at this approximate instant
  const melbISO = naive.toLocaleString('sv', { timeZone: APP_TZ }); // "YYYY-MM-DD HH:MM:SS"
  const offsetMs =
    new Date(melbISO.replace(' ', 'T') + 'Z').getTime() - naive.getTime();
  // Step 3: subtract offset to get actual UTC
  return new Date(naive.getTime() - offsetMs).toISOString();
}

/**
 * Format a UTC ISO string for display in Melbourne time.
 * Defaults to date + time (no seconds).
 */
export function formatMelbourne(
  iso: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = {},
): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: APP_TZ,
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...opts,
  });
}

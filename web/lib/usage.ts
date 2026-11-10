import "server-only";

// Usage aggregation for the developer dashboard. The Go API writes one row per key
// per day into `api_usage` (api_key_id, day, requests); here we fold a window of those
// rows into per-key totals + a small sparkline. Pure functions — easy to reason about
// and to test.

export type UsageRow = { api_key_id: string; day: string; requests: number };
export type KeyUsage = { today: number; last7: number; last30: number; spark: number[] };

export const USAGE_WINDOW_DAYS = 30; // how far back the dashboard reads
export const SPARK_DAYS = 14; // bars in the per-key sparkline

const DAY_MS = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Last `n` calendar days as YYYY-MM-DD, oldest → newest, in UTC (matches the DB's
 *  `current_date` on Supabase). The newest entry is "today". */
export function lastNDays(n: number, today = new Date()): string[] {
  const base = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(ymd(new Date(base - i * DAY_MS)));
  return out;
}

/** Fold raw api_usage rows into { keyId → {today, last7, last30, spark[14]} }. */
export function aggregateUsage(
  rows: UsageRow[],
  today = new Date(),
): Record<string, KeyUsage> {
  const days = lastNDays(USAGE_WINDOW_DAYS, today);
  const todayStr = days[days.length - 1];
  const last7 = new Set(days.slice(-7));
  const sparkDays = days.slice(-SPARK_DAYS);

  // counts[keyId][day] = requests
  const byKey: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const perDay = (byKey[r.api_key_id] ??= {});
    perDay[r.day] = (perDay[r.day] ?? 0) + Number(r.requests);
  }

  const out: Record<string, KeyUsage> = {};
  for (const [kid, perDay] of Object.entries(byKey)) {
    let today = 0;
    let l7 = 0;
    let l30 = 0;
    for (const [d, c] of Object.entries(perDay)) {
      l30 += c;
      if (last7.has(d)) l7 += c;
      if (d === todayStr) today += c;
    }
    out[kid] = { today, last7: l7, last30: l30, spark: sparkDays.map((d) => perDay[d] ?? 0) };
  }
  return out;
}

/** Sum per-key usage into an account-wide summary (across all keys, incl. revoked). */
export function summarize(usage: Record<string, KeyUsage>): {
  today: number;
  last7: number;
  last30: number;
} {
  return Object.values(usage).reduce(
    (a, u) => ({ today: a.today + u.today, last7: a.last7 + u.last7, last30: a.last30 + u.last30 }),
    { today: 0, last7: 0, last30: 0 },
  );
}

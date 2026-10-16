/**
 * ADR 0063 (D1): when an analysis is NOT sent to the model. Pure, so the Edge
 * Function and the tests use the same rule.
 *
 *   1. The last good analysis is still within the frequency → reuse it.
 *   2. The last attempt failed within the frequency → wait (no retry storm).
 *   3. Past the frequency, the input fingerprint equals the last good one → reuse it, for up to
 *      max(1 day, 3 × frequency) (a daily feature would otherwise never reuse).
 *
 * `force` («Volver a analizar») skips all three; the database quota still applies.
 */
export interface InsightRow {
  status: string;
  created_at: string;
  input_hash?: string | null;
}

const DAY_MS = 24 * 3_600_000;

export function withinFrequency(row: InsightRow | undefined, frequencyMin: number, now: number): boolean {
  return Boolean(row) && frequencyMin > 0 && now - new Date(row!.created_at).getTime() < frequencyMin * 60_000;
}

/** Before computing the input: reuse, wait after an error, or go on. `rows` = newest first. */
export function decideBeforeInput(
  rows: InsightRow[],
  frequencyMin: number,
  now: number,
  force = false,
): { kind: "reuse"; row: InsightRow } | { kind: "error_backoff" } | { kind: "compute" } {
  const lastGood = rows.find((r) => r.status === "ok" || r.status === "empty");
  if (!force && lastGood && withinFrequency(lastGood, frequencyMin, now)) return { kind: "reuse", row: lastGood };
  if (!force && rows[0]?.status === "error" && withinFrequency(rows[0], frequencyMin, now)) return { kind: "error_backoff" };
  return { kind: "compute" };
}

/** How long the same input keeps its answer: a day, or three periods of a slower feature. */
export function sameInputWindowMs(frequencyMin: number): number {
  return Math.max(DAY_MS, 3 * Math.max(frequencyMin, 0) * 60_000);
}

/** After computing the input: the same fingerprint as the last good analysis (within the window) is reused. */
export function sameInputAsLast(rows: InsightRow[], inputHash: string, now: number, frequencyMin: number, force = false): InsightRow | null {
  const lastGood = rows.find((r) => r.status === "ok" || r.status === "empty");
  if (force || !lastGood?.input_hash || lastGood.input_hash !== inputHash) return null;
  return now - new Date(lastGood.created_at).getTime() < sameInputWindowMs(frequencyMin) ? lastGood : null;
}

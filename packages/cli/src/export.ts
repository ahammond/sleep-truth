import { eveningOf, normalizeOura, parseNightsFile, type NightsFile, type OuraSleepDoc } from "@sleep-truth/core";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function checkDate(name: string, value: string): void {
  if (!DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${name} must be a date as YYYY-MM-DD, got "${value}"`);
  }
}

/**
 * Nights whose evening (the row they print on) falls in [from, to].
 * The result is validated, so a file the page would reject fails here.
 */
export function exportNights(docs: OuraSleepDoc[], from: string, to: string, now: Date): { file: NightsFile; skipped: number } {
  checkDate("--from", from);
  checkDate("--to", to);
  const { file, skipped } = normalizeOura(docs, now);
  const periods = file.periods.filter((p) => {
    const e = eveningOf(p);
    return e >= from && e <= to;
  });
  return { file: parseNightsFile({ ...file, periods }), skipped };
}

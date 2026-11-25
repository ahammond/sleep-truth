import { normalizeOura, type NightsFile, type OuraSleepDoc } from "@sleep-truth/core";

function dateMillis(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function exportNights(docs: OuraSleepDoc[], from: string, to: string, now: Date): { file: NightsFile; skipped: number } {
  const lower = dateMillis(from) - 86_400_000;
  const upper = dateMillis(to) + 2 * 86_400_000;
  const inRange = docs.filter((doc) => {
    const localStart = Date.parse(`${doc.bedtime_start.slice(0, 10)}T00:00:00Z`);
    return localStart >= lower && localStart < upper;
  });
  return normalizeOura(inRange, now);
}

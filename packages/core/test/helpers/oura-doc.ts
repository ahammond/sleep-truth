import type { OuraSleepDoc } from "../../src/oura.ts";

/** Add seconds to an ISO timestamp, keeping its offset string. Synthetic fixtures only. */
export function addSecondsKeepOffset(iso: string, s: number): string {
  const m = /^(.*?)(Z|[+-]\d{2}:\d{2})$/.exec(iso);
  if (!m) throw new Error(`bad iso ${iso}`);
  const [, local, tz] = m as unknown as [string, string, string];
  const naive = Date.parse(`${local}Z`) + s * 1000;
  return new Date(naive).toISOString().slice(0, 19) + tz;
}

let seq = 0;

/**
 * A synthetic Oura sleep document. `stages` uses Oura digits
 * (1 deep, 2 light, 3 REM, 4 awake), one per 30 s epoch.
 */
export function ouraDoc(p: {
  id?: string;
  type?: string;
  start: string;
  stages: string;
  movement?: string;
  asleepS?: number;
}): OuraSleepDoc {
  const n = p.stages.length;
  return {
    id: p.id ?? `doc-${++seq}`,
    type: p.type ?? "long_sleep",
    bedtime_start: p.start,
    bedtime_end: addSecondsKeepOffset(p.start, n * 30),
    sleep_phase_30_sec: p.stages,
    sleep_phase_5_min: null,
    movement_30_sec: p.movement ?? "1".repeat(n),
    total_sleep_duration: p.asleepS ?? [...p.stages].filter((c) => c !== "4").length * 30,
    time_in_bed: n * 30,
  };
}

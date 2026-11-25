import type { Period } from "../../src/nights.ts";
import { addSecondsKeepOffset } from "./oura-doc.ts";

let seq = 0;

/** A synthetic Period. `stages` uses our letters (W R L D), one per 30 s epoch. */
export function period(p: {
  id?: string;
  start: string;
  stages: string;
  movement?: string;
  end?: string;
  asleepS?: number;
  inBedS?: number;
  sourceType?: string;
}): Period {
  const n = p.stages.length;
  return {
    id: p.id ?? `test:${++seq}`,
    start: p.start,
    end: p.end ?? addSecondsKeepOffset(p.start, n * 30),
    source_type: p.sourceType ?? "long_sleep",
    epoch_seconds: 30,
    stages: p.stages,
    movement: p.movement ?? "0".repeat(n),
    totals: {
      asleep_s: p.asleepS ?? [...p.stages].filter((s) => s !== "W").length * 30,
      in_bed_s: p.inBedS ?? n * 30,
    },
  };
}

/** `hours` of light sleep as a stage string. */
export function hours(h: number, stage = "L"): string {
  return stage.repeat(Math.round(h * 120));
}

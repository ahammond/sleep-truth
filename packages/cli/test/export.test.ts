import { describe, expect, it } from "vitest";
import { parseNightsFile, type OuraSleepDoc } from "../../core/src/index.ts";
import { exportNights } from "../src/export.ts";

function doc(id: string, start: string): OuraSleepDoc {
  return { id, type: "long_sleep", day: start.slice(0, 10), bedtime_start: start, bedtime_end: new Date(Date.parse(start) + 90_000).toISOString(), sleep_phase_30_sec: "222", sleep_phase_5_min: null, movement_30_sec: "111", total_sleep_duration: 90, time_in_bed: 90 };
}

describe("exportNights", () => {
  it("keeps dates one day around the requested range and produces a valid file", () => {
    const result = exportNights([
      doc("before", "2025-12-31T22:00:00-07:00"),
      doc("edge-before", "2026-01-01T22:00:00-07:00"),
      doc("inside", "2026-01-02T22:00:00-07:00"),
      doc("edge-after", "2026-01-04T22:00:00-07:00"),
      doc("after", "2026-01-05T22:00:00-07:00"),
    ], "2026-01-02", "2026-01-03", new Date("2026-01-10T00:00:00Z"));
    expect(result.file.periods.map((period) => period.id)).toEqual(["oura:edge-before", "oura:inside", "oura:edge-after"]);
    expect(parseNightsFile(result.file)).toEqual(result.file);
    expect(result.skipped).toBe(0);
  });
});

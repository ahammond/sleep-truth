import { describe, expect, it } from "vitest";
import { parseNightsFile, type OuraSleepDoc } from "../../core/src/index.ts";
import { exportNights } from "../src/export.ts";

function doc(id: string, start: string, patch: Partial<OuraSleepDoc> = {}): OuraSleepDoc {
  const end = start.replace(/T(\d\d):(\d\d)/, (_m, h: string, mm: string) => `T${h}:${String(Number(mm) + 1).padStart(2, "0")}`);
  return { id, type: "long_sleep", day: start.slice(0, 10), bedtime_start: start, bedtime_end: end, sleep_phase_30_sec: "22", sleep_phase_5_min: null, movement_30_sec: "11", total_sleep_duration: 60, time_in_bed: 60, ...patch };
}

describe("exportNights", () => {
  it("keeps exactly the periods whose evening is in the range", () => {
    const result = exportNights([
      doc("prev-evening", "2026-01-01T22:00:00-07:00"),
      doc("prev-after-midnight", "2026-01-02T01:00:00-07:00"),
      doc("first", "2026-01-02T22:00:00-07:00"),
      doc("last-after-midnight", "2026-01-04T00:30:00-07:00"),
      doc("next-evening", "2026-01-04T22:00:00-07:00"),
    ], "2026-01-02", "2026-01-03", new Date("2026-01-10T00:00:00Z"));
    expect(result.file.periods.map((period) => period.id)).toEqual(["oura:first", "oura:last-after-midnight"]);
    expect(parseNightsFile(result.file)).toEqual(result.file);
    expect(result.skipped).toBe(0);
  });

  it("writes a file the page accepts even when Oura sends null type", () => {
    const result = exportNights([doc("t", "2026-01-02T22:00:00-07:00", { type: null })], "2026-01-02", "2026-01-02", new Date());
    expect(parseNightsFile(JSON.parse(JSON.stringify(result.file))).periods[0]?.source_type).toBe("unknown");
  });

  it("rejects malformed dates", () => {
    expect(() => exportNights([], "2026-1-5", "2026-01-06", new Date())).toThrow(/YYYY-MM-DD/);
  });
});

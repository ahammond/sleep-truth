import { describe, expect, it } from "vitest";
import { NightsFileError, offsetMinutes, parseNightsFile } from "../src/index.ts";

function validFile(): Record<string, unknown> {
  return {
    schema: "sleep-truth/nights",
    version: 1,
    source: { device: "oura", exported_at: "2026-11-20T08:00:00Z" },
    periods: [
      {
        id: "oura:abc",
        start: "2026-11-18T22:41:00-07:00",
        end: "2026-11-18T22:43:00-07:00",
        source_type: "long_sleep",
        epoch_seconds: 30,
        stages: "WLDR",
        movement: "0123",
        totals: { asleep_s: 90, in_bed_s: 120 },
      },
    ],
  };
}

function withPeriod(patch: Record<string, unknown>): Record<string, unknown> {
  const f = validFile();
  const periods = f.periods as Record<string, unknown>[];
  periods[0] = { ...periods[0], ...patch };
  return f;
}

describe("parseNightsFile", () => {
  it("parses a valid file", () => {
    const input = validFile();
    expect(parseNightsFile(JSON.parse(JSON.stringify(input)))).toEqual(input);
  });

  it("rejects wrong schema", () => {
    expect(() => parseNightsFile({ ...validFile(), schema: "nope" })).toThrow(NightsFileError);
    expect(() => parseNightsFile({ ...validFile(), schema: "nope" })).toThrow(/schema/);
  });

  it("rejects a non-object", () => {
    expect(() => parseNightsFile(null)).toThrow(NightsFileError);
    expect(() => parseNightsFile("x")).toThrow(NightsFileError);
  });

  it("rejects stages with letters outside WRLD", () => {
    expect(() => parseNightsFile(withPeriod({ stages: "WLXR" }))).toThrow(/stages/);
  });

  it("rejects movement length != stages length", () => {
    expect(() => parseNightsFile(withPeriod({ movement: "012" }))).toThrow(/movement/);
  });

  it("rejects movement digits outside 0-3", () => {
    expect(() => parseNightsFile(withPeriod({ movement: "0124" }))).toThrow(/movement/);
  });

  it("rejects a start without an offset", () => {
    expect(() => parseNightsFile(withPeriod({ start: "2026-11-18T22:41:00" }))).toThrow(/start/);
  });

  it("rejects bad totals", () => {
    expect(() => parseNightsFile(withPeriod({ totals: { asleep_s: -1, in_bed_s: 1 } }))).toThrow(/totals/);
  });
});

describe("offsetMinutes", () => {
  it("reads the offset", () => {
    expect(offsetMinutes("2026-11-18T22:41:00-07:00")).toBe(-420);
    expect(offsetMinutes("2026-11-18T22:41:00+05:30")).toBe(330);
    expect(offsetMinutes("2026-11-18T22:41:00Z")).toBe(0);
    expect(offsetMinutes("2026-11-18T22:41:00.000-07:00")).toBe(-420);
  });
});

describe("native_epoch_seconds", () => {
  it("accepts a coarser source resolution", () => {
    expect(parseNightsFile(withPeriod({ native_epoch_seconds: 300 })).periods[0]?.native_epoch_seconds).toBe(300);
  });
  it("rejects a resolution that is not a whole number of epochs", () => {
    expect(() => parseNightsFile(withPeriod({ native_epoch_seconds: 45 }))).toThrow(NightsFileError);
    expect(() => parseNightsFile(withPeriod({ native_epoch_seconds: 0 }))).toThrow(NightsFileError);
  });
});

import { describe, expect, it } from "vitest";
import { addDays, holidayMap, homeOffset, markRows, type Row } from "../src/index.ts";
import { period } from "./helpers/period.ts";

function fakeRows(offsets: Array<number | null>, first = "2026-11-15"): Row[] {
  return offsets.map((offset, i) => {
    const evening = addDays(first, i);
    return {
      evening,
      weekday: i % 7,
      offset,
      placed:
        offset === null
          ? []
          : [{ period: period({ start: `${evening}T23:00:00${fmt(offset)}`, stages: "LL" }), segments: [], moves: [] }],
      naps: 0,
      asleep_s: 0,
      in_bed_s: 0,
    };
  });
}

function fmt(offset: number): string {
  const sign = offset < 0 ? "-" : "+";
  const a = Math.abs(offset);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

describe("holidayMap", () => {
  it("BC holidays 2026", () => {
    const m = holidayMap({ country: "CA", state: "BC" }, [2026]);
    expect(m.get("2026-11-11")).toBe("Remembrance Day");
    expect(m.has("2026-11-12")).toBe(false);
    expect(m.get("2026-08-03")).toBe("British Columbia Day");
  });

  it("public holidays only", () => {
    const m = holidayMap({ country: "CA", state: "BC" }, [2026]);
    for (const name of m.values()) expect(name).not.toMatch(/Halloween|Valentine/);
  });

  it("covers several years", () => {
    const m = holidayMap({ country: "CA", state: "BC" }, [2026, 2027]);
    expect(m.has("2026-12-25")).toBe(true);
    expect(m.has("2027-12-25")).toBe(true);
  });
});

describe("markRows", () => {
  it("Remembrance Day hatches two rows", () => {
    const rows = fakeRows([null, null, null], "2026-11-10");
    const m = markRows(rows, holidayMap({ country: "CA", state: "BC" }, [2026]));
    expect(m[0]?.hatch).toEqual([{ from: 240, to: 960 }]);
    expect(m[0]?.holidayName).toBeUndefined();
    expect(m[1]?.hatch).toEqual([{ from: 0, to: 240 }]);
    expect(m[1]?.holidayName).toBe("Remembrance Day");
    expect(m[2]?.hatch).toEqual([]);
  });

  it("consecutive holidays merge into one band", () => {
    const h = new Map([
      ["2026-12-25", "Christmas Day"],
      ["2026-12-26", "Boxing Day"],
    ]);
    const m = markRows(fakeRows([null], "2026-12-25"), h);
    expect(m[0]?.hatch).toEqual([{ from: 0, to: 960 }]);
  });

  it("tz change", () => {
    const m = markRows(fakeRows([-420, -420, -300, -300]), new Map());
    expect(m.map((x) => x.tzChange)).toEqual([undefined, undefined, { from: -420, to: -300 }, undefined]);
    expect(m.map((x) => x.away)).toEqual([undefined, undefined, -300, -300]);
  });

  it("empty rows do not break tz detection", () => {
    const m = markRows(fakeRows([-420, null, -300]), new Map());
    expect(m[2]?.tzChange).toEqual({ from: -420, to: -300 });
    expect(m[1]?.tzChange).toBeUndefined();
    expect(m[1]?.away).toBeUndefined();
  });

  it("DST inside a period", () => {
    const rows = fakeRows([-480, -480, -420]);
    rows[1]!.placed = [
      {
        period: period({ start: "2026-11-16T23:00:00-08:00", end: "2026-11-17T07:00:00-07:00", stages: "LL" }),
        segments: [],
        moves: [],
      },
    ];
    const m = markRows(rows, new Map());
    expect(m[1]?.tzChange).toEqual({ from: -480, to: -420 });
    // The change was already shown inside the night; the next row does not repeat it.
    expect(m[2]?.tzChange).toBeUndefined();
  });
});

describe("homeOffset", () => {
  it("most common, ties to the earliest", () => {
    expect(homeOffset(fakeRows([-300, -420, -420, -300]))).toBe(-300);
    expect(homeOffset(fakeRows([-300, -420, -420]))).toBe(-420);
    expect(homeOffset(fakeRows([null, null]))).toBeNull();
  });
});

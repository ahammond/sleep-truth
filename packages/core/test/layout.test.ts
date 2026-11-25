import { describe, expect, it } from "vitest";
import { buildRows, groupWeeks, paginate, type Row } from "../src/index.ts";
import { hours, period } from "./helpers/period.ts";

function row(rows: Row[], evening: string): Row {
  const r = rows.find((x) => x.evening === evening);
  if (!r) throw new Error(`no row ${evening}`);
  return r;
}

describe("buildRows", () => {
  it("normal night", () => {
    const rows = buildRows([period({ start: "2026-11-18T22:41:00-07:00", stages: hours(7) })], "2026-11-18", "2026-11-18");
    const r = row(rows, "2026-11-18");
    expect(r.placed).toHaveLength(1);
    expect(r.placed[0]?.segments[0]?.from).toBe(161);
    expect(r.weekday).toBe(3);
    expect(r.offset).toBe(-420);
  });

  it("after-midnight start belongs to previous evening", () => {
    const rows = buildRows([period({ start: "2026-11-19T01:10:00-07:00", stages: hours(6) })], "2026-11-18", "2026-11-19");
    expect(row(rows, "2026-11-18").placed).toHaveLength(1);
    expect(row(rows, "2026-11-19").placed).toHaveLength(0);
    expect(row(rows, "2026-11-18").placed[0]?.segments[0]?.from).toBe(310);
  });

  it("split night", () => {
    const a = period({ start: "2026-11-18T22:00:00-07:00", stages: hours(4), asleepS: 14000, inBedS: 14400 });
    const b = period({ start: "2026-11-19T02:40:00-07:00", stages: hours(3 + 50 / 60), asleepS: 13000, inBedS: 13800 });
    const r = row(buildRows([a, b], "2026-11-18", "2026-11-18"), "2026-11-18");
    expect(r.placed).toHaveLength(2);
    expect(r.asleep_s).toBe(27000);
    expect(r.in_bed_s).toBe(28200);
  });

  it("afternoon nap is counted, not drawn", () => {
    const nap = period({ start: "2026-11-19T14:00:00-07:00", stages: hours(40 / 60), sourceType: "late_nap" });
    const rows = buildRows([nap], "2026-11-18", "2026-11-19");
    const r = row(rows, "2026-11-19");
    expect(r.naps).toBe(1);
    expect(r.placed).toHaveLength(0);
    expect(r.asleep_s).toBe(0);
    expect(row(rows, "2026-11-18").naps).toBe(0);
  });

  it("clips at window edge", () => {
    const p = period({ start: "2026-11-18T19:30:00-07:00", stages: hours(8), inBedS: 29000 });
    const r = row(buildRows([p], "2026-11-18", "2026-11-18"), "2026-11-18");
    expect(r.placed[0]?.segments[0]?.from).toBe(0);
    expect(r.in_bed_s).toBe(29000);
  });

  it("clips past noon", () => {
    const p = period({ start: "2026-11-19T06:00:00-07:00", stages: hours(8) });
    const r = row(buildRows([p], "2026-11-18", "2026-11-18"), "2026-11-18");
    const segs = r.placed[0]?.segments ?? [];
    expect(segs.at(-1)?.to).toBe(960);
    expect(segs[0]?.from).toBe(600);
  });

  it("offset follows longest period", () => {
    const long = period({ start: "2026-11-18T22:00:00-07:00", stages: hours(7) });
    const short = period({ start: "2026-11-19T09:00:00-05:00", stages: hours(1) });
    const r = row(buildRows([long, short], "2026-11-18", "2026-11-18"), "2026-11-18");
    expect(r.placed).toHaveLength(2);
    expect(r.offset).toBe(-420);
  });

  it("places by the period's own local clock", () => {
    // 05:00 UTC is 22:00 at -07:00 and 00:00 at -05:00; both are evening 2026-11-18.
    const west = period({ start: "2026-11-18T22:00:00-07:00", stages: hours(1) });
    const east = period({ start: "2026-11-25T00:00:00-05:00", stages: hours(1) });
    const rows = buildRows([west, east], "2026-11-18", "2026-11-24");
    expect(row(rows, "2026-11-18").placed[0]?.segments[0]?.from).toBe(120);
    expect(row(rows, "2026-11-24").placed[0]?.segments[0]?.from).toBe(240);
    expect(row(rows, "2026-11-24").offset).toBe(-300);
  });

  it("ties go to the later evening", () => {
    // 08:00 on the 19th to 00:00 on the 20th: 4 h in each window.
    const p = period({ start: "2026-11-19T08:00:00-07:00", stages: hours(16) });
    const rows = buildRows([p], "2026-11-18", "2026-11-19");
    expect(row(rows, "2026-11-18").placed).toHaveLength(0);
    expect(row(rows, "2026-11-19").placed).toHaveLength(1);
  });

  it("missing nights and partial weeks", () => {
    const inRange = period({ start: "2026-11-13T23:00:00-07:00", stages: hours(7) });
    const before = period({ start: "2026-11-09T23:00:00-07:00", stages: hours(7) });
    const after = period({ start: "2026-11-20T23:00:00-07:00", stages: hours(7) });
    const rows = buildRows([before, inRange, after], "2026-11-11", "2026-11-17");
    expect(rows).toHaveLength(14);
    expect(rows[0]?.evening).toBe("2026-11-08");
    expect(rows[13]?.evening).toBe("2026-11-21");
    expect(rows.map((r) => r.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]);
    expect(rows.filter((r) => r.placed.length > 0).map((r) => r.evening)).toEqual(["2026-11-13"]);
    expect(row(rows, "2026-11-09").offset).toBeNull();
    const weeks = groupWeeks(rows);
    expect(weeks.map((w) => w.sunday)).toEqual(["2026-11-08", "2026-11-15"]);
    expect(weeks.every((w) => w.rows.length === 7)).toBe(true);
  });

  it("crosses month and year ends", () => {
    const rows = buildRows([], "2026-12-30", "2027-01-02");
    expect(rows[0]?.evening).toBe("2026-12-27");
    expect(rows.at(-1)?.evening).toBe("2027-01-02");
    expect(rows).toHaveLength(7);
  });

  it("merges runs", () => {
    const p = period({ start: "2026-11-18T22:00:00-07:00", stages: "LLLDD", movement: "00120" });
    const placed = row(buildRows([p], "2026-11-18", "2026-11-18"), "2026-11-18").placed[0];
    expect(placed?.segments).toEqual([
      { stage: "L", from: 120, to: 121.5 },
      { stage: "D", from: 121.5, to: 122.5 },
    ]);
    expect(placed?.moves).toEqual([
      { level: 1, from: 121, to: 121.5 },
      { level: 2, from: 121.5, to: 122 },
    ]);
  });
});

describe("groupWeeks", () => {
  it("fills missing days so a week always has 7 rows", () => {
    const rows = buildRows([], "2026-11-08", "2026-11-14").filter((r) => r.weekday !== 3);
    const weeks = groupWeeks(rows);
    expect(weeks).toHaveLength(1);
    expect(weeks[0]?.rows.map((r) => r.evening)).toEqual([
      "2026-11-08",
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
    ]);
  });
});

describe("paginate", () => {
  it("2 weeks per page", () => {
    const weeks = groupWeeks(buildRows([], "2026-11-01", "2026-11-21"));
    expect(weeks).toHaveLength(3);
    expect(paginate(weeks).map((p) => p.weeks.length)).toEqual([2, 1]);
  });
});

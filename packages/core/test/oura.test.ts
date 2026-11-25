import { describe, expect, it } from "vitest";
import { normalizeOura, parseNightsFile } from "../src/index.ts";
import { ouraDoc } from "./helpers/oura-doc.ts";

const NOW = new Date("2026-11-20T08:00:00Z");
const START = "2026-11-18T22:41:00-07:00";

function one(doc: Parameters<typeof normalizeOura>[0][number]) {
  const { file, skipped } = normalizeOura([doc], NOW);
  return { period: file.periods[0], skipped, file };
}

describe("normalizeOura", () => {
  it("maps Oura digits", () => {
    const { period } = one(ouraDoc({ start: START, stages: "4213", movement: "1234" }));
    expect(period?.stages).toBe("WLDR");
    expect(period?.movement).toBe("0123");
  });

  it("writes a file parseNightsFile accepts", () => {
    const { file } = one(ouraDoc({ start: START, stages: "4213" }));
    expect(file.schema).toBe("sleep-truth/nights");
    expect(file.source).toEqual({ device: "oura", exported_at: NOW.toISOString() });
    expect(parseNightsFile(JSON.parse(JSON.stringify(file)))).toEqual(file);
  });

  it("drops deleted and rest", () => {
    const { file, skipped } = normalizeOura(
      [
        ouraDoc({ type: "deleted", start: START, stages: "22" }),
        ouraDoc({ type: "rest", start: START, stages: "22" }),
        ouraDoc({ type: "long_sleep", start: START, stages: "22" }),
      ],
      NOW,
    );
    expect(file.periods).toHaveLength(1);
    expect(skipped).toBe(0);
  });

  it("keeps source_type verbatim", () => {
    expect(one(ouraDoc({ type: "late_nap", start: START, stages: "22" })).period?.source_type).toBe("late_nap");
  });

  it("falls back to 5-minute phases", () => {
    const doc = { ...ouraDoc({ start: START, stages: "2".repeat(20) }), sleep_phase_30_sec: null, sleep_phase_5_min: "42" };
    const { period } = one(doc);
    expect(period?.stages).toBe("W".repeat(10) + "L".repeat(10));
    expect(period?.movement).toHaveLength(20);
  });

  it("falls back to 5-minute phases when 30-second phases are empty", () => {
    const doc = { ...ouraDoc({ start: START, stages: "2".repeat(10) }), sleep_phase_30_sec: "", sleep_phase_5_min: "3" };
    expect(one(doc).period?.stages).toBe("R".repeat(10));
  });

  it("skips periods with no phases", () => {
    const doc = { ...ouraDoc({ start: START, stages: "22" }), sleep_phase_30_sec: null, sleep_phase_5_min: null };
    const { file, skipped } = one(doc);
    expect(file.periods).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it("skips zero-length periods", () => {
    const doc = { ...ouraDoc({ start: START, stages: "22" }), bedtime_end: START };
    const { file, skipped } = one(doc);
    expect(file.periods).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it("skips phase strings with unknown digits", () => {
    const { file, skipped } = one(ouraDoc({ start: START, stages: "2252" }));
    expect(file.periods).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it("pads short movement with 0", () => {
    expect(one(ouraDoc({ start: START, stages: "2222", movement: "23" })).period?.movement).toBe("1200");
  });

  it("truncates long movement", () => {
    expect(one(ouraDoc({ start: START, stages: "22", movement: "2341" })).period?.movement).toBe("12");
  });

  it("treats null movement as none", () => {
    const doc = { ...ouraDoc({ start: START, stages: "222" }), movement_30_sec: null };
    expect(one(doc).period?.movement).toBe("000");
  });

  it("maps unknown movement digits to 0", () => {
    expect(one(ouraDoc({ start: START, stages: "222", movement: "1x9" })).period?.movement).toBe("000");
  });

  it("totals come from Oura", () => {
    const doc = { ...ouraDoc({ start: START, stages: "4222", asleepS: 25920 }), time_in_bed: 31740 };
    expect(one(doc).period?.totals).toEqual({ asleep_s: 25920, in_bed_s: 31740 });
  });

  it("null total_sleep_duration counts non-W epochs", () => {
    const doc = { ...ouraDoc({ start: START, stages: "4223" }), total_sleep_duration: null };
    expect(one(doc).period?.totals.asleep_s).toBe(90);
  });

  it("dedupes by id, last wins", () => {
    const { file } = normalizeOura(
      [ouraDoc({ id: "x", start: START, stages: "22" }), ouraDoc({ id: "x", start: START, stages: "33" })],
      NOW,
    );
    expect(file.periods).toHaveLength(1);
    expect(file.periods[0]?.stages).toBe("RR");
  });

  it("id is prefixed", () => {
    expect(one(ouraDoc({ id: "abc", start: START, stages: "22" })).period?.id).toBe("oura:abc");
  });

  it("keeps Oura's start and end strings", () => {
    const doc = ouraDoc({ start: START, stages: "22" });
    const { period } = one(doc);
    expect(period?.start).toBe(doc.bedtime_start);
    expect(period?.end).toBe(doc.bedtime_end);
  });

  it("sorts periods by start", () => {
    const { file } = normalizeOura(
      [
        ouraDoc({ id: "b", start: "2026-11-19T22:00:00-07:00", stages: "22" }),
        ouraDoc({ id: "a", start: "2026-11-18T23:00:00-05:00", stages: "22" }),
        ouraDoc({ id: "c", start: "2026-11-18T22:30:00-07:00", stages: "22" }),
      ],
      NOW,
    );
    expect(file.periods.map((p) => p.id)).toEqual(["oura:a", "oura:c", "oura:b"]);
  });
});

describe("normalizeOura with schema-legal nulls", () => {
  it("null type becomes source_type unknown", () => {
    const doc = { ...ouraDoc({ start: START, stages: "22" }), type: null };
    const { file } = normalizeOura([doc], NOW);
    expect(file.periods[0]?.source_type).toBe("unknown");
    expect(() => parseNightsFile(JSON.parse(JSON.stringify(file)))).not.toThrow();
  });
});

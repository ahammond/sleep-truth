import { offsetMinutes, type NightsFile, type Period } from "./nights.ts";

/** The fields of an Oura v2 `sleep` document that we use. */
export interface OuraSleepDoc {
  id: string;
  /** Oura's schema allows null. */
  type: string | null;
  day?: string;
  bedtime_start: string;
  bedtime_end: string;
  sleep_phase_30_sec: string | null;
  sleep_phase_5_min: string | null;
  movement_30_sec: string | null;
  total_sleep_duration: number | null;
  time_in_bed: number;
}

/** Oura phase digits: 1 deep, 2 light, 3 REM, 4 awake. */
const PHASE: Record<string, string> = { "1": "D", "2": "L", "3": "R", "4": "W" };
/** Oura movement digits: 1 none, 2 restless, 3 tossing, 4 active. */
const MOVE: Record<string, string> = { "1": "0", "2": "1", "3": "2", "4": "3" };
const DROPPED_TYPES = new Set(["deleted", "rest"]);

function stagesOf(doc: OuraSleepDoc): { stages: string; native: number } | null {
  let digits = doc.sleep_phase_30_sec;
  let native = 30;
  if (!digits) {
    const five = doc.sleep_phase_5_min;
    if (!five) return null;
    digits = [...five].map((c) => c.repeat(10)).join("");
    native = 300;
  }
  let out = "";
  for (const c of digits) {
    const s = PHASE[c];
    if (!s) return null;
    out += s;
  }
  return { stages: out, native };
}

function movementOf(doc: OuraSleepDoc, length: number): string {
  const raw = (doc.movement_30_sec ?? "").slice(0, length);
  return [...raw].map((c) => MOVE[c] ?? "0").join("").padEnd(length, "0");
}

function hasOffset(iso: string): boolean {
  try {
    offsetMinutes(iso);
    return true;
  } catch {
    return false;
  }
}

function toPeriod(doc: OuraSleepDoc): Period | null {
  // Rows are placed on the wearable's local clock, so a timestamp without an offset cannot be drawn.
  if (!hasOffset(doc.bedtime_start) || !hasOffset(doc.bedtime_end)) return null;
  const start = Date.parse(doc.bedtime_start);
  const end = Date.parse(doc.bedtime_end);
  if (!(end > start)) return null;
  const parsed = stagesOf(doc);
  if (!parsed) return null;
  const { stages, native } = parsed;
  const asleep = doc.total_sleep_duration ?? [...stages].filter((s) => s !== "W").length * 30;
  return {
    id: `oura:${doc.id}`,
    start: doc.bedtime_start,
    end: doc.bedtime_end,
    source_type: doc.type ?? "unknown",
    epoch_seconds: 30,
    stages,
    movement: movementOf(doc, stages.length),
    totals: { asleep_s: asleep, in_bed_s: doc.time_in_bed },
    ...(native > 30 ? { native_epoch_seconds: native } : {}),
  };
}

/**
 * Turn Oura sleep documents into a nights file. Deleted and rest documents
 * are dropped silently; documents we cannot draw (no phases, zero length,
 * unknown digits) are counted in `skipped`.
 */
export function normalizeOura(docs: OuraSleepDoc[], exportedAt: Date): { file: NightsFile; skipped: number } {
  const byId = new Map<string, OuraSleepDoc>();
  for (const doc of docs) {
    byId.delete(doc.id);
    byId.set(doc.id, doc);
  }
  let skipped = 0;
  const periods: Period[] = [];
  for (const doc of byId.values()) {
    if (doc.type !== null && DROPPED_TYPES.has(doc.type)) continue;
    const p = toPeriod(doc);
    if (p) periods.push(p);
    else skipped++;
  }
  periods.sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.id.localeCompare(b.id));
  return {
    file: {
      schema: "sleep-truth/nights",
      version: 1,
      source: { device: "oura", exported_at: exportedAt.toISOString() },
      periods,
    },
    skipped,
  };
}

import { offsetMinutes, type Period, type Stage } from "./nights.ts";

/** A calendar date, `YYYY-MM-DD`. */
export type ISODate = string;

/** Minutes from 20:00 on the row's evening, clipped to [0, 960]. */
export interface Segment {
  stage: Stage;
  from: number;
  to: number;
}

export interface MoveRun {
  level: 1 | 2 | 3;
  from: number;
  to: number;
}

export interface PlacedPeriod {
  period: Period;
  segments: Segment[];
  moves: MoveRun[];
}

export interface Row {
  /** The evening the night starts. */
  evening: ISODate;
  /** 0 = Sunday. */
  weekday: number;
  /** Start offset (minutes east of UTC) of the longest placed period; null when empty. */
  offset: number | null;
  placed: PlacedPeriod[];
  naps: number;
  asleep_s: number;
  in_bed_s: number;
}

export interface Week {
  sunday: ISODate;
  rows: Row[];
}

export interface Page {
  weeks: Week[];
}

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const EPOCH_MS = 30_000;
/** Window per row: 20:00 to 12:00 next day. */
export const WINDOW_START_MIN = 20 * 60;
export const WINDOW_MINUTES = 960;

// All date arithmetic below works on "naive" milliseconds: the wall-clock
// reading expressed as if it were UTC. The host time zone never enters.

function dateMs(d: ISODate): number {
  const ms = Date.parse(`${d}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new Error(`bad date: ${d}`);
  return ms;
}

function msDate(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  return msDate(dateMs(d) + n * DAY);
}

export function weekdayOf(d: ISODate): number {
  return new Date(dateMs(d)).getUTCDay();
}

function windowStart(evening: ISODate): number {
  return dateMs(evening) + WINDOW_START_MIN * MIN;
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function clip(m: number): number {
  return Math.min(WINDOW_MINUTES, Math.max(0, m));
}

type Placement = { kind: "row"; evening: ISODate } | { kind: "nap"; evening: ISODate };

function place(p: Period): { placement: Placement; localStart: number } {
  const localStart = Date.parse(p.start) + offsetMinutes(p.start) * MIN;
  const localEnd = localStart + p.stages.length * EPOCH_MS;
  const startDate = msDate(Math.floor(localStart / DAY) * DAY);
  let best: ISODate | null = null;
  let bestOverlap = 0;
  for (const e of [addDays(startDate, -1), startDate]) {
    const w0 = windowStart(e);
    const o = overlap(localStart, localEnd, w0, w0 + WINDOW_MINUTES * MIN);
    if (o > 0 && o >= bestOverlap) {
      best = e;
      bestOverlap = o;
    }
  }
  if (best) return { placement: { kind: "row", evening: best }, localStart };
  const hour = (localStart - dateMs(startDate)) / (60 * MIN);
  return { placement: { kind: "nap", evening: hour >= 12 ? startDate : addDays(startDate, -1) }, localStart };
}

/** The evening whose row a period belongs to (as a drawn night or as a nap). */
export function eveningOf(p: Period): ISODate {
  return place(p).placement.evening;
}

function runs<T extends string>(s: string, base: number, skip?: T): Array<{ value: T; from: number; to: number }> {
  const out: Array<{ value: T; from: number; to: number }> = [];
  let i = 0;
  while (i < s.length) {
    const v = s[i] as T;
    let j = i + 1;
    while (j < s.length && s[j] === v) j++;
    if (v !== skip) {
      const from = clip(base + i / 2);
      const to = clip(base + j / 2);
      if (to > from) out.push({ value: v, from, to });
    }
    i = j;
  }
  return out;
}

function placeOnRow(p: Period, evening: ISODate, localStart: number): PlacedPeriod {
  const base = (localStart - windowStart(evening)) / MIN;
  return {
    period: p,
    segments: runs<Stage>(p.stages, base).map((r) => ({ stage: r.value, from: r.from, to: r.to })),
    moves: runs<"0" | "1" | "2" | "3">(p.movement, base, "0").map((r) => ({
      level: Number(r.value) as 1 | 2 | 3,
      from: r.from,
      to: r.to,
    })),
  };
}

function emptyRow(evening: ISODate): Row {
  return { evening, weekday: weekdayOf(evening), offset: null, placed: [], naps: 0, asleep_s: 0, in_bed_s: 0 };
}

/**
 * One row per evening, padded out to whole Sunday-to-Saturday weeks around
 * [from, to]. Periods whose evening falls outside [from, to] are left out.
 */
export function buildRows(periods: Period[], from: ISODate, to: ISODate): Row[] {
  const first = addDays(from, -weekdayOf(from));
  const last = addDays(to, 6 - weekdayOf(to));
  const rows: Row[] = [];
  const byEvening = new Map<ISODate, Row>();
  for (let d = first; d <= last; d = addDays(d, 1)) {
    const r = emptyRow(d);
    rows.push(r);
    byEvening.set(d, r);
  }
  const longest = new Map<Row, number>();
  for (const p of periods) {
    const { placement, localStart } = place(p);
    if (placement.evening < from || placement.evening > to) continue;
    const r = byEvening.get(placement.evening);
    if (!r) continue;
    if (placement.kind === "nap") {
      r.naps++;
      continue;
    }
    r.placed.push(placeOnRow(p, placement.evening, localStart));
    r.asleep_s += p.totals.asleep_s;
    r.in_bed_s += p.totals.in_bed_s;
    if (p.stages.length > (longest.get(r) ?? -1)) {
      longest.set(r, p.stages.length);
      r.offset = offsetMinutes(p.start);
    }
  }
  for (const r of rows) r.placed.sort((a, b) => (a.segments[0]?.from ?? 0) - (b.segments[0]?.from ?? 0));
  return rows;
}

/** Group rows into Sunday-to-Saturday weeks; missing days become empty rows. */
export function groupWeeks(rows: Row[]): Week[] {
  const bySunday = new Map<ISODate, Map<ISODate, Row>>();
  for (const r of rows) {
    const sunday = addDays(r.evening, -r.weekday);
    let m = bySunday.get(sunday);
    if (!m) bySunday.set(sunday, (m = new Map()));
    m.set(r.evening, r);
  }
  return [...bySunday.keys()].sort().map((sunday) => {
    const m = bySunday.get(sunday)!;
    const weekRows: Row[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(sunday, i);
      weekRows.push(m.get(d) ?? emptyRow(d));
    }
    return { sunday, rows: weekRows };
  });
}

export function paginate(weeks: Week[], perPage = 2): Page[] {
  const pages: Page[] = [];
  for (let i = 0; i < weeks.length; i += perPage) pages.push({ weeks: weeks.slice(i, i + perPage) });
  return pages;
}

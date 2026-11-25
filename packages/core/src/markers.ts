import Holidays from "date-holidays";
import { addDays, type ISODate, type Row } from "./layout.ts";
import { offsetMinutes } from "./nights.ts";

export interface Region {
  country: string;
  state?: string;
}

export interface RowMarkers {
  /** Set when the row's evening date is a public holiday. */
  holidayName?: string;
  /** Holiday bands, minutes from 20:00, merged. */
  hatch: Array<{ from: number; to: number }>;
  /** Offsets in minutes east of UTC. */
  tzChange?: { from: number; to: number };
  /** The row's offset when it differs from home. */
  away?: number;
}

const MIDNIGHT = 240;
const END = 960;

/** The most common non-null row offset; ties go to the one seen first. */
export function homeOffset(rows: Row[]): number | null {
  const counts = new Map<number, number>();
  for (const r of rows) if (r.offset !== null) counts.set(r.offset, (counts.get(r.offset) ?? 0) + 1);
  let best: number | null = null;
  let bestCount = 0;
  for (const [offset, n] of counts) {
    if (n > bestCount) {
      best = offset;
      bestCount = n;
    }
  }
  return best;
}

/** Public holidays for a region, keyed by date. Several on one date are joined. */
export function holidayMap(region: Region, years: number[]): Map<ISODate, string> {
  const hd = region.state ? new Holidays(region.country, region.state) : new Holidays(region.country);
  const out = new Map<ISODate, string>();
  for (const year of years) {
    const list = hd.getHolidays(year) || [];
    for (const h of list) {
      if (h.type !== "public") continue;
      const date = h.date.slice(0, 10);
      const prev = out.get(date);
      out.set(date, prev && prev !== h.name ? `${prev} / ${h.name}` : h.name);
    }
  }
  return out;
}

function longestPlaced(r: Row) {
  let best = r.placed[0];
  for (const p of r.placed) if (best && p.period.stages.length > best.period.stages.length) best = p;
  return best;
}

/** Markers for each row, same order as `rows`. */
export function markRows(rows: Row[], holidays: Map<ISODate, string>): RowMarkers[] {
  const home = homeOffset(rows);
  let last: number | null = null;
  return rows.map((r) => {
    const m: RowMarkers = { hatch: [] };
    const today = holidays.get(r.evening);
    const tomorrow = holidays.get(addDays(r.evening, 1));
    if (today !== undefined) m.holidayName = today;
    if (today !== undefined && tomorrow !== undefined) m.hatch.push({ from: 0, to: END });
    else if (today !== undefined) m.hatch.push({ from: 0, to: MIDNIGHT });
    else if (tomorrow !== undefined) m.hatch.push({ from: MIDNIGHT, to: END });

    if (r.offset !== null) {
      if (home !== null && r.offset !== home) m.away = r.offset;
      const inside = r.placed
        .map((p) => ({ from: offsetMinutes(p.period.start), to: offsetMinutes(p.period.end) }))
        .find((c) => c.from !== c.to);
      if (inside) {
        m.tzChange = inside;
      } else if (last !== null && r.offset !== last) {
        m.tzChange = { from: last, to: r.offset };
      }
      const lp = longestPlaced(r);
      last = inside ? inside.to : lp ? offsetMinutes(lp.period.end) : r.offset;
    }
    return m;
  });
}

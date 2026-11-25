import { type ISODate, type Page, type PlacedPeriod, type Row, WINDOW_MINUTES } from "./layout.ts";
import type { RowMarkers } from "./markers.ts";
import type { Stage } from "./nights.ts";

export type Palette = "mono" | "color";

export interface RenderContext {
  title: string;
  pageNo: number;
  pageCount: number;
  home: number | null;
  palette?: Palette;
}

export const DISCLAIMER =
  "Not a diagnostic tool. Shows data recorded by a consumer wearable; stages are Oura's estimates, not polysomnography.";

// Layout constants, ported from docs/design/week-grid-mockup.html style A.
const W = 1100;
const H = 850;
const GX = 34;
const CX = 168;
const CW = 760;
const SX = 948;
const ROW_H = 48;
const BAND = 7.5;
const LEVEL: Record<Stage, number> = { W: 0, R: 1, L: 2, D: 3 };
const MOVE_H: Record<1 | 2 | 3, number> = { 1: 3, 2: 5.5, 3: 8 };

const BLACK = "#000000";
const FILLS: Record<Palette, Record<Stage, string>> = {
  mono: { W: "#ffffff", R: "#cfcfcf", L: "#8c8c8c", D: "#2b2b2b" },
  color: { W: "#f6b26b", R: "#7fc8f8", L: "#3d85c6", D: "#1c2e6b" },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Escape for SVG text nodes (never used inside attributes). */
export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** `UTC-7`, `UTC+5:30`, `UTC+0`. */
export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const a = Math.abs(minutes);
  const h = Math.floor(a / 60);
  const m = a % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

/** `7h12`. */
export function formatDuration(seconds: number): string {
  let h = Math.floor(seconds / 3600);
  let m = Math.round((seconds - h * 3600) / 60);
  if (m === 60) {
    h++;
    m = 0;
  }
  return `${h}h${String(m).padStart(2, "0")}`;
}

/** `Nov 13`. */
export function formatShortDate(d: ISODate): string {
  return `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
}

function n(v: number): string {
  return String(Math.round(v * 100) / 100);
}

function x(minutes: number): number {
  return CX + (minutes / WINDOW_MINUTES) * CW;
}

function hourLabel(hourFrom20: number): string {
  const h = (20 + hourFrom20) % 24;
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}${h < 12 ? "a" : "p"}`;
}

function drawPlaced(p: PlacedPeriod, y0: number, fills: Record<Stage, string>): string {
  let s = "";
  p.segments.forEach((g, i) => {
    const yy = y0 + LEVEL[g.stage] * BAND;
    const w = Math.max(0.6, x(g.to) - x(g.from));
    s += `<rect x="${n(x(g.from))}" y="${n(yy)}" width="${n(w)}" height="${BAND}" fill="${fills[g.stage]}" stroke="${g.stage === "W" ? BLACK : "none"}" stroke-width="0.6"/>`;
    const prev = p.segments[i - 1];
    if (prev && Math.abs(prev.to - g.from) < 1e-9) {
      const a = y0 + LEVEL[prev.stage] * BAND;
      const top = Math.min(a, yy);
      const bot = Math.max(a, yy) + BAND;
      s += `<line x1="${n(x(g.from))}" x2="${n(x(g.from))}" y1="${n(top)}" y2="${n(bot)}" stroke="${BLACK}" stroke-width="0.5"/>`;
    }
  });
  const base = y0 + 31 + 8;
  for (const m of p.moves) {
    const h = MOVE_H[m.level];
    const w = Math.max(0.6, x(m.to) - x(m.from));
    s += `<rect x="${n(x(m.from))}" y="${n(base - h)}" width="${n(w)}" height="${h}" fill="${BLACK}"/>`;
  }
  return s;
}

function drawLegend(fills: Record<Stage, string>): string {
  const lx = 590;
  const ly = 30;
  let s = `<text x="${lx}" y="${ly}" font-size="10" fill="#444444">Stage (top = awake)</text>`;
  const stages: Array<[Stage, string]> = [
    ["W", "Awake"],
    ["R", "REM"],
    ["L", "Light"],
    ["D", "Deep"],
  ];
  stages.forEach(([k, label], i) => {
    const yy = ly + 5 + i * 10;
    s += `<rect x="${lx}" y="${yy}" width="22" height="${BAND}" fill="${fills[k]}" stroke="${k === "W" ? BLACK : "none"}" stroke-width="0.6"/>`;
    s += `<text x="${lx + 28}" y="${n(yy + 6.5)}" font-size="8.5">${label}</text>`;
  });
  s += `<text x="${lx + 120}" y="${ly}" font-size="10" fill="#444444">Movement</text>`;
  const moves: Array<[1 | 2 | 3, string]> = [
    [1, "restless"],
    [2, "tossing"],
    [3, "active"],
  ];
  moves.forEach(([level, label], i) => {
    const yy = ly + 15 + i * 12;
    const h = MOVE_H[level];
    s += `<rect x="${lx + 120}" y="${n(yy - h)}" width="4" height="${h}" fill="${BLACK}"/>`;
    s += `<text x="${lx + 130}" y="${yy}" font-size="8.5">${label}</text>`;
  });
  s += `<text x="${lx + 220}" y="${ly}" font-size="10" fill="#444444">Markers</text>`;
  const marks: Array<[string, string]> = [
    ["◆", "public holiday"],
    ["✈", "time zone change"],
  ];
  marks.forEach(([g, label], i) => {
    const yy = ly + 15 + i * 12;
    s += `<text x="${lx + 222}" y="${yy}" font-size="9">${g}</text><text x="${lx + 235}" y="${yy}" font-size="8.5">${label}</text>`;
  });
  s += `<text x="${lx + 345}" y="${ly}" font-size="10" fill="#444444">Holiday hours</text>`;
  s += `<rect x="${lx + 345}" y="${ly + 7}" width="30" height="12" fill="url(#hatch)" stroke="#bbbbbb" stroke-width="0.5"/>`;
  return s;
}

function gutterNotes(m: RowMarkers | undefined): string[] {
  const notes: string[] = [];
  if (!m) return notes;
  if (m.holidayName) notes.push(`◆ ${m.holidayName}`);
  if (m.tzChange) notes.push(`✈ ${formatOffset(m.tzChange.from)} → ${formatOffset(m.tzChange.to)}`);
  else if (m.away !== undefined) notes.push(`local ${formatOffset(m.away)}`);
  return notes;
}

function drawRow(r: Row, m: RowMarkers | undefined, y0: number, fills: Record<Stage, string>, last: boolean): string {
  let s = "";
  for (const h of m?.hatch ?? []) {
    s += `<rect x="${n(x(h.from))}" y="${n(y0 - 2)}" width="${n(x(h.to) - x(h.from))}" height="44" fill="url(#hatch)" opacity="0.8"/>`;
  }
  s += `<text x="${GX}" y="${y0 + 12}" font-size="12" font-weight="600">${DAYS[r.weekday]}</text>`;
  s += `<text x="${GX + 30}" y="${y0 + 12}" font-size="12">${formatShortDate(r.evening)}</text>`;
  gutterNotes(m).forEach((note, i) => {
    s += `<text x="${GX}" y="${y0 + 26 + i * 10}" font-size="9">${escapeXml(note)}</text>`;
  });
  if (m?.tzChange) {
    s += `<line x1="${CX - 6}" x2="${CX + CW}" y1="${n(y0 - 3.5)}" y2="${n(y0 - 3.5)}" stroke="${BLACK}" stroke-width="0.8" stroke-dasharray="4,2"/>`;
  }
  if (r.placed.length === 0) {
    s += `<text x="${CX + 8}" y="${y0 + 18}" font-size="10" fill="#888888">no data</text>`;
  } else {
    s += `<line x1="${CX}" x2="${CX + CW}" y1="${y0 + 39}" y2="${y0 + 39}" stroke="#cccccc" stroke-width="0.5"/>`;
    for (const p of r.placed) s += drawPlaced(p, y0, fills);
    s += `<text x="${SX}" y="${y0 + 18}" font-size="11.5"><tspan font-weight="600">${formatDuration(r.asleep_s)}</tspan> / ${formatDuration(r.in_bed_s)}</text>`;
  }
  if (r.naps > 0) {
    s += `<text x="${SX}" y="${y0 + 31}" font-size="9" fill="#444444">+${r.naps} nap${r.naps === 1 ? "" : "s"}</text>`;
  }
  if (!last) {
    s += `<line x1="${GX}" x2="${W - GX}" y1="${y0 + ROW_H - 4}" y2="${y0 + ROW_H - 4}" stroke="#f0f0f0" stroke-width="0.5"/>`;
  }
  return s;
}

/** One US-Letter-landscape page as a standalone SVG document. */
export function renderPage(page: Page, markers: Map<ISODate, RowMarkers>, ctx: RenderContext): string {
  const fills = FILLS[ctx.palette ?? "mono"];
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="Helvetica Neue, Arial, sans-serif">`;
  s += `<defs><pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="#b5b5b5" stroke-width="1.4"/></pattern></defs>`;
  s += `<rect width="${W}" height="${H}" fill="#ffffff"/>`;
  s += `<text x="${GX}" y="44" font-size="20" font-weight="600">${escapeXml(ctx.title)}</text>`;
  const home = ctx.home === null ? "" : ` (home ${formatOffset(ctx.home)})`;
  s += `<text x="${GX}" y="62" font-size="10.5" fill="#444444">Oura Ring · 30-second stages · local clock time${escapeXml(home)} · rows start on the evening shown</text>`;
  s += drawLegend(fills);

  let y = 96;
  for (const wk of page.weeks) {
    s += `<text x="${GX}" y="${y + 10}" font-size="11" font-weight="600">Week of ${formatShortDate(wk.sunday)}</text>`;
    for (let h = 0; h <= 16; h += 2) {
      s += `<text x="${n(x(h * 60))}" y="${y + 10}" font-size="9" text-anchor="middle" fill="#333333">${hourLabel(h)}</text>`;
    }
    s += `<text x="${SX}" y="${y + 10}" font-size="9" fill="#333333">asleep / in bed</text>`;
    const top = y + 16;
    const bottom = top + 7 * ROW_H - 6;
    for (let h = 0; h <= 16; h++) {
      const midnight = h === 4;
      const major = h % 2 === 0;
      const stroke = midnight ? "#888888" : major ? "#d6d6d6" : "#eeeeee";
      const dash = midnight || major ? "" : ` stroke-dasharray="1.5,2"`;
      s += `<line x1="${n(x(h * 60))}" x2="${n(x(h * 60))}" y1="${top}" y2="${bottom}" stroke="${stroke}" stroke-width="${midnight ? 0.9 : 0.6}"${dash}/>`;
    }
    wk.rows.forEach((r, i) => {
      s += drawRow(r, markers.get(r.evening), top + i * ROW_H, fills, i === 6);
    });
    y = bottom + 22;
  }
  s += `<text x="${GX}" y="${H - 22}" font-size="8.5" fill="#444444">${escapeXml(DISCLAIMER)}</text>`;
  s += `<text x="${W - GX}" y="${H - 22}" font-size="8.5" fill="#444444" text-anchor="end">Page ${ctx.pageNo} of ${ctx.pageCount} · sleep-truth</text>`;
  s += "</svg>";
  return s;
}

/** "Nov 8 – Nov 21, 2026" or "Dec 27, 2026 – Jan 9, 2027". */
export function formatRange(from: ISODate, to: ISODate): string {
  const fy = from.slice(0, 4);
  const ty = to.slice(0, 4);
  if (fy === ty) return `${formatShortDate(from)} – ${formatShortDate(to)}, ${ty}`;
  return `${formatShortDate(from)}, ${fy} – ${formatShortDate(to)}, ${ty}`;
}

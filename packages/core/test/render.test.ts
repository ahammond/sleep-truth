import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildRows,
  groupWeeks,
  holidayMap,
  homeOffset,
  markRows,
  paginate,
  renderPage,
  type ISODate,
  type Page,
  type RowMarkers,
} from "../src/index.ts";
import { period } from "./helpers/period.ts";
import { synthNight } from "./helpers/synth.ts";

const DISCLAIMER =
  "Not a diagnostic tool. Shows data recorded by a consumer wearable; stages are Oura's estimates, not polysomnography.";

function fixture(): { page: Page; markers: Map<ISODate, RowMarkers>; home: number | null } {
  const nights: Array<[string, number, string, number]> = [
    // [evening, bed hour (24+ = after midnight), offset, hours]
    ["2026-11-08", 22.3, "-07:00", 8],
    ["2026-11-10", 22.9, "-07:00", 9.5],
    ["2026-11-11", 23.4, "-07:00", 7],
    ["2026-11-12", 22.5, "-07:00", 7.9],
    ["2026-11-14", 24.9, "-07:00", 8.6],
    ["2026-11-15", 22.7, "-07:00", 7.7],
    ["2026-11-16", 22.2, "-07:00", 4.7],
    ["2026-11-17", 22.5, "-07:00", 7.9],
    ["2026-11-18", 23.0, "-07:00", 7.4],
    ["2026-11-19", 24.8, "-05:00", 7.1],
    ["2026-11-20", 24.3, "-05:00", 7.2],
    ["2026-11-21", 25.2, "-05:00", 8],
  ];
  const periods = nights.map(([evening, bed, off, h], i) => {
    const day = bed >= 24 ? nextDay(evening) : evening;
    const hh = Math.floor(bed % 24);
    const mm = Math.round((bed % 1) * 60);
    const { stages, movement } = synthNight(1000 + i, h);
    return period({ start: `${day}T${pad(hh)}:${pad(mm)}:00${off}`, stages, movement });
  });
  // The known row for totals: Fri Nov 13, asleep 7h12, in bed 8h49.
  const fri = synthNight(77, 8.8);
  periods.push(period({ start: "2026-11-13T23:50:00-07:00", ...fri, asleepS: 25920, inBedS: 31740 }));
  // Second period on Mon Nov 16 (a split night).
  periods.push(period({ start: "2026-11-17T03:36:00-07:00", ...synthNight(78, 2.9) }));
  // An afternoon nap on Sun Nov 15.
  periods.push(period({ start: "2026-11-15T14:00:00-07:00", stages: "L".repeat(60), sourceType: "late_nap" }));
  const rows = buildRows(periods, "2026-11-08", "2026-11-21");
  const m = markRows(rows, holidayMap({ country: "CA", state: "BC" }, [2026]));
  const markers = new Map(rows.map((r, i) => [r.evening, m[i]!]));
  const pages = paginate(groupWeeks(rows));
  return { page: pages[0]!, markers, home: homeOffset(rows) };
}

function nextDay(d: string): string {
  return new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

function pad(v: number): string {
  return String(v).padStart(2, "0");
}

function render(palette?: "mono" | "color"): string {
  const { page, markers, home } = fixture();
  return renderPage(page, markers, { title: "Sleep, night by night · Nov 8 – Nov 21, 2026", pageNo: 1, pageCount: 1, home, palette });
}

function text(svg: string): string {
  return svg.replace(/<[^>]+>/g, "");
}

describe("renderPage", () => {
  it("contains the disclaimer and page number", () => {
    const svg = render();
    expect(svg).toContain(DISCLAIMER);
    expect(text(svg)).toContain("Page 1 of 1");
  });

  it("is one svg document", () => {
    const svg = render();
    expect(svg.startsWith('<svg viewBox="0 0 1100 850"')).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("only grays in mono", () => {
    const values = [...render("mono").matchAll(/(?:fill|stroke)="([^"]*)"/g)].map((m) => m[1]);
    expect(values.length).toBeGreaterThan(100);
    for (const v of values) expect(v).toMatch(/^(none|url\(#hatch\)|#([0-9a-f]{2})\2\2)$/i);
  });

  it("color palette changes stage fills only", () => {
    const mono = render("mono");
    const color = render("color");
    for (const c of ["#f6b26b", "#7fc8f8", "#3d85c6", "#1c2e6b"]) expect(color).toContain(`fill="${c}"`);
    const strip = (s: string) => s.replace(/fill="#[0-9a-f]{6}"/gi, 'fill="X"');
    expect(strip(color)).toBe(strip(mono));
    expect(render()).toBe(mono);
  });

  it("draws 14 row labels", () => {
    const t = render();
    const days = t.match(/>(Sun|Mon|Tue|Wed|Thu|Fri|Sat)</g) ?? [];
    expect(days).toHaveLength(14);
    expect(t).toContain(">Fri<");
    expect(t).toContain(">Nov 13<");
  });

  it("shows totals", () => {
    expect(text(render())).toContain("7h12 / 8h49");
  });

  it("shows markers", () => {
    const t = text(render());
    expect(t).toContain("◆ Remembrance Day");
    expect(t).toContain("✈ UTC-7 → UTC-5");
    expect(t).toContain("local UTC-5");
    expect(t).toContain("no data");
    expect(t).toContain("+1 nap");
    expect(t).toContain("home UTC-7");
  });

  it("escapes text", () => {
    const { page, markers, home } = fixture();
    markers.set("2026-11-09", { holidayName: "A<B", hatch: [] });
    const svg = renderPage(page, markers, { title: "T&<", pageNo: 1, pageCount: 2, home });
    expect(svg).toContain("◆ A&lt;B");
    expect(svg).toContain("T&amp;&lt;");
    expect(svg).not.toContain("A<B");
    expect(svg).toContain("Page 1 of 2");
  });

  it("matches the snapshot", () => {
    const svg = render();
    if (process.env.SLEEP_TRUTH_SVG_OUT) {
      writeFileSync(process.env.SLEEP_TRUTH_SVG_OUT, svg);
      writeFileSync(process.env.SLEEP_TRUTH_SVG_OUT.replace(/\.svg$/, "-color.svg"), render("color"));
    }
    expect(svg).toMatchSnapshot();
  });
});

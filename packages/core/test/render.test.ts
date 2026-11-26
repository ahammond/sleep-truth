import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildRows,
  groupWeeks,
  newestFirst,
  holidayMap,
  homeOffset,
  markRows,
  paginate,
  parseNightsFile,
  renderPage,
  type ISODate,
  type Page,
  type RowMarkers,
} from "../src/index.ts";
import { period } from "./helpers/period.ts";
import { synthNight } from "./helpers/synth.ts";

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
  const pages = paginate(newestFirst(groupWeeks(rows)));
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
  return renderPage(page, markers, { title: "Sleep, night by night · Nov 8 – Nov 21, 2026", pageNo: 1, pageCount: 1, home, palette, device: "oura" });
}

function text(svg: string): string {
  return svg.replace(/<[^>]+>/g, "");
}

const DISCLAIMER =
  "Sleep Truth shows data recorded by a consumer wearable. It is not a medical device, not a diagnostic tool, and not medical advice.";

describe("renderPage", () => {
  it("contains the page number", () => {
    expect(text(render())).toContain("Page 1 of 1");
  });

  it("draws the time zone boundary between the changed night and the earlier night below it", () => {
    const svg = render();
    const labelY = (d: string) => Number(svg.match(new RegExp(`<text x="\\d+" y="([\\d.]+)" font-size="12">${d}</text>`))![1]);
    const dashes = [...svg.matchAll(/<line [^>]*y1="([\d.]+)"[^>]*stroke-dasharray="4,2"/g)].map((m) => Number(m[1]));
    expect(dashes).toHaveLength(1);
    expect(dashes[0]!).toBeGreaterThan(labelY("Nov 19"));
    expect(dashes[0]!).toBeLessThan(labelY("Nov 18"));
  });

  it("bakes the disclaimer into every page in both palettes", () => {
    expect(text(render("mono"))).toContain(DISCLAIMER);
    expect(text(render("color"))).toContain(DISCLAIMER);
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

describe("gutter notes fit the gutter", () => {
  const long = "National Day for Truth and Reconciliation";

  function gutterLines(marker: RowMarkers): string[] {
    const { page, markers, home } = fixture();
    markers.set("2026-11-09", marker);
    const svg = renderPage(page, markers, { title: "T", pageNo: 1, pageCount: 1, home });
    const row = svg.split(">Nov 9<")[1]!.split(/>(Sun|Mon|Tue|Wed|Thu|Fri|Sat)</)[0]!;
    return [...row.matchAll(/font-size="9">([^<]*)</g)].map((m) => m[1]!);
  }

  it("wraps a long holiday name onto two lines", () => {
    const lines = gutterLines({ holidayName: long, hatch: [] });
    expect(lines).toEqual(["◆ National Day for Truth", "and Reconciliation"]);
  });

  it("shortens it to one line when a time zone note needs the second", () => {
    const lines = gutterLines({ holidayName: long, hatch: [], tzChange: { from: -420, to: -300 } });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^◆ National Day for .*…$/);
    expect(lines[1]).toBe("✈ UTC-7 → UTC-5");
  });

  it("keeps every line within the gutter width", () => {
    for (const lines of [gutterLines({ holidayName: long, hatch: [] }), gutterLines({ holidayName: "x".repeat(80), hatch: [] })]) {
      for (const line of lines) expect(line.length).toBeLessThanOrEqual(26);
    }
  });
});

describe("gutter wrapping edge", () => {
  it("never leaves the ◆ alone on a line", () => {
    const { page, markers, home } = fixture();
    markers.set("2026-11-09", { holidayName: "x".repeat(80), hatch: [] });
    const svg = renderPage(page, markers, { title: "T", pageNo: 1, pageCount: 1, home });
    const row = svg.split(">Nov 9<")[1]!.split(/>(Sun|Mon|Tue|Wed|Thu|Fri|Sat)</)[0]!;
    expect(row).not.toMatch(/>◆</);
    expect(row).toMatch(/>◆ x+…</);
  });
});

describe("source line", () => {
  it("names the device from the file and says when nights were coarser", () => {
    const { page, markers, home } = fixture();
    markers.set("2026-11-09", { hatch: [], coarseSeconds: 300 });
    const plain = text(renderPage(page, new Map(), { title: "T", pageNo: 1, pageCount: 1, home, device: "oura" }));
    expect(plain).toContain("Oura Ring · 30-second stages ·");
    const coarse = text(renderPage(page, markers, { title: "T", pageNo: 1, pageCount: 1, home, device: "oura" }));
    expect(coarse).toContain("1 night here has only 5-min stages, marked in the row.");
    expect(coarse).toContain("5-min stages");
  });
});

describe("gutter wrapping, long words", () => {
  it("shortens an overlong word on any line, not just the last", () => {
    const { page, markers, home } = fixture();
    markers.set("2026-11-09", { holidayName: `${"x".repeat(30)} Day`, hatch: [] });
    const svg = renderPage(page, markers, { title: "T", pageNo: 1, pageCount: 1, home });
    const row = svg.split(">Nov 9<")[1]!.split(/>(Sun|Mon|Tue|Wed|Thu|Fri|Sat)</)[0]!;
    const lines = [...row.matchAll(/font-size="9">([^<]*)</g)].map((m) => m[1]!);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(26);
    expect(lines.at(-1)).toBe("Day");
  });
});

describe("version skew", () => {
  it("says a newer file needs a newer page", () => {
    expect(() => parseNightsFile({ schema: "sleep-truth/nights", version: 2, source: {}, periods: [] })).toThrow(/newer Sleep Truth/);
  });
});

describe("coarse notes per page", () => {
  it("say nothing on a page without coarse rows, and print the real resolution", () => {
    const { page, markers, home } = fixture();
    expect(text(renderPage(page, markers, { title: "T", pageNo: 1, pageCount: 1, home }))).not.toContain("marked in the row");
    markers.set("2026-11-09", { hatch: [], coarseSeconds: 60 });
    expect(text(renderPage(page, markers, { title: "T", pageNo: 1, pageCount: 1, home }))).toContain("only 1-min stages");
  });

  it("keeps three gutter notes above the row rule", () => {
    const { page, markers, home } = fixture();
    markers.set("2026-11-09", { holidayName: "Remembrance Day", hatch: [], tzChange: { from: -420, to: -300 }, coarseSeconds: 300 });
    const svg = renderPage(page, markers, { title: "T", pageNo: 1, pageCount: 1, home });
    const ys = [...svg.split(">Nov 9<")[1]!.split(/>(Sun|Mon|Tue|Wed|Thu|Fri|Sat)</)[0]!.matchAll(/y="([\d.]+)" font-size="9">/g)].map((m) => Number(m[1]));
    const rowTop = Number(svg.split(">Nov 9<")[0]!.match(/y="([\d.]+)" font-size="12"$/)![1]) - 12;
    expect(ys).toHaveLength(3);
    expect(Math.max(...ys)).toBeLessThanOrEqual(rowTop + 44);
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { NightsFile } from "@sleep-truth/core";
import { renderReport, type Settings } from "../src/app.ts";
import { period } from "../../core/test/helpers/period.ts";

const BASE: Settings = { region: { country: "CA", state: "BC" }, palette: "mono" };

/** A synthetic file with one night per evening from `first`, for `nights` evenings. */
function nightsFile(first: string, nights: number): string {
  const periods = [];
  for (let i = 0; i < nights; i++) {
    const d = new Date(Date.parse(`${first}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
    periods.push(period({ id: `t:${i}`, start: `${d}T22:30:00-07:00`, stages: "L".repeat(800) + "D".repeat(100) }));
  }
  const file: NightsFile = {
    schema: "sleep-truth/nights",
    version: 1,
    source: { device: "oura", exported_at: "2026-11-25T00:00:00Z" },
    periods,
  };
  return JSON.stringify(file);
}

describe("renderReport", () => {
  it("two weeks give one page, three give two", () => {
    const two = renderReport(nightsFile("2026-11-08", 14), BASE);
    expect(two.error).toBeUndefined();
    expect(two.pages).toHaveLength(1);
    expect(two.range).toEqual({ from: "2026-11-08", to: "2026-11-21" });
    const three = renderReport(nightsFile("2026-11-08", 21), BASE);
    expect(three.pages).toHaveLength(2);
    expect(three.pages[1]).toContain("Page 2 of 2");
  });

  it("newest week comes first, then back in time", () => {
    const r = renderReport(nightsFile("2026-11-08", 21), BASE);
    const first = r.pages[0]!;
    expect(first).toContain("Week of Nov 22");
    expect(first.indexOf("Week of Nov 22")).toBeLessThan(first.indexOf("Week of Nov 15"));
    expect(r.pages[1]).toContain("Week of Nov 8");
  });

  it("days run newest first too, so dates descend without a break", () => {
    const r = renderReport(nightsFile("2026-11-08", 21), BASE);
    const days = [...r.pages.join("").matchAll(/<text[^>]*>Nov (\d+)<\/text>/g)].map((m) => Number(m[1]));
    expect(days).toEqual(Array.from({ length: 21 }, (_, i) => 28 - i));
  });

  it("bad file gives an error, no throw", () => {
    const r = renderReport("{}", BASE);
    expect(r.error).toMatch(/schema/);
    expect(r.pages).toEqual([]);
  });

  it("invalid JSON gives an error, no throw", () => {
    expect(renderReport("not json", BASE).error).toMatch(/JSON/);
  });

  it("a file with no nights gives an error", () => {
    const empty = JSON.stringify({ ...JSON.parse(nightsFile("2026-11-08", 1)), periods: [] });
    expect(renderReport(empty, BASE).error).toMatch(/no nights/i);
  });

  it("range filter", () => {
    const r = renderReport(nightsFile("2026-11-08", 21), { ...BASE, to: "2026-11-20" });
    expect(r.pages).toHaveLength(1);
    expect(r.range).toEqual({ from: "2026-11-08", to: "2026-11-20" });
  });

  it("from after to is an error", () => {
    expect(renderReport(nightsFile("2026-11-08", 7), { ...BASE, from: "2026-11-10", to: "2026-11-09" }).error).toMatch(
      /before/,
    );
  });

  it("palette", () => {
    const file = nightsFile("2026-11-08", 7);
    expect(renderReport(file, { ...BASE, palette: "color" }).pages[0]).toContain("#3d85c6");
    expect(renderReport(file, BASE).pages[0]).not.toContain("#3d85c6");
  });

  it("marks holidays for the chosen region", () => {
    const file = nightsFile("2026-11-08", 7);
    expect(renderReport(file, BASE).pages[0]).toContain("Remembrance Day");
    expect(renderReport(file, { ...BASE, region: { country: "US" } }).pages[0]).toContain("Veterans Day");
  });
});

const DISCLAIMER =
  "Sleep Truth shows data recorded by a consumer wearable. It is not a medical device, not a diagnostic tool, and not medical advice.";

describe("print hides controls", () => {
  const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");
  const main = readFileSync(fileURLToPath(new URL("../src/main.ts", import.meta.url)), "utf8");
  const css = readFileSync(fileURLToPath(new URL("../src/print.css", import.meta.url)), "utf8");

  it("every interactive element sits inside the no-print header", () => {
    const open = html.indexOf('<header class="controls no-print"');
    const close = html.indexOf("</header>");
    expect(open).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(open);
    for (const m of html.matchAll(/<(input|button|select|label|textarea|a)\b/g)) {
      expect(m.index! > open && m.index! < close, `${m[0]} at ${m.index}`).toBe(true);
    }
  });

  it("the error banner is no-print", () => {
    expect(html).toMatch(/<div id="error" class="[^"]*\bno-print\b/);
  });

  it("shows the disclaimer outside no-print content before a file is loaded", () => {
    const footer = html.match(/<footer[^>]*>([^]*?)<\/footer>/);
    expect(footer?.[1]).toContain(DISCLAIMER);
    expect(footer?.[0]).not.toMatch(/\bno-print\b/);
  });

  it("hides the page footer in print only when sheets carry their own disclaimer", () => {
    // Each rendered sheet bakes the disclaimer into its SVG (core render test), so a
    // printed page never depends on the browser repeating a fixed element.
    const hides = [...css.matchAll(/([^{}]*)\{[^}]*display:\s*none[^}]*\}/g)].map((m) => (m[1] ?? "").trim());
    for (const selector of hides.filter((s) => /\.disclaimer/.test(s))) {
      expect(selector).toMatch(/:has\(\.sheet\)/);
    }
    expect(css).toMatch(/@media print\s*{[^]*body:has\(\.sheet\) \.disclaimer\s*{[^}]*display:\s*none/);
  });

  it("main.ts creates no interactive elements at runtime", () => {
    expect(main).not.toMatch(/createElement\(["'](input|button|select|label|textarea|a)["']/);
    expect(main).not.toMatch(/<(input|button|select|label|textarea|a)\b/);
  });

  it("print css hides .no-print", () => {
    expect(css).toMatch(/@media print\s*{[^]*\.no-print\s*{\s*display:\s*none\s*!important/);
  });
});

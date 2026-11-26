import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { beforeAll, describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
let outDir = "";
let html = "";

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), "sleep-truth-web-"));
  await build({
    root,
    configFile: join(root, "vite.config.ts"),
    logLevel: "silent",
    build: { outDir, emptyOutDir: true },
  });
  html = readFileSync(join(outDir, "index.html"), "utf8");
}, 120_000);

describe("single-file build", () => {
  it("holds exactly index.html", () => {
    expect(readdirSync(outDir)).toEqual(["index.html"]);
  });

  it("loads nothing from the network", () => {
    expect(html).not.toMatch(/src="http/);
    expect(html).not.toMatch(/href="http/);
    expect(html).not.toMatch(/<script[^>]*\bsrc=/);
    expect(html).not.toMatch(/<link[^>]*\bhref=/);
    expect(html).toContain("connect-src 'none'");
  });

  it("keeps the print rule", () => {
    expect(html).toMatch(/@media print/);
    expect(html).toMatch(/\.no-print\s*{\s*display:\s*none\s*!important/);
  });

  it("contains no network call at all, not even an inert one", () => {
    expect(html).not.toMatch(/\bfetch\(/);
    expect(html).not.toMatch(/XMLHttpRequest|sendBeacon|WebSocket/);
  });
});

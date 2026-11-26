import { mkdir, mkdtemp, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readDocs, writeDocs } from "../src/cache.ts";
import { paths } from "../src/paths.ts";

const doc = { id: "night/one", type: "long_sleep", day: "2026-01-02", bedtime_start: "2026-01-01T22:00:00-07:00", bedtime_end: "2026-01-02T06:00:00-07:00", sleep_phase_30_sec: "222", sleep_phase_5_min: null, movement_30_sec: "111", total_sleep_duration: 90, time_in_bed: 90 };

describe("cache and paths", () => {
  it("overwrites a cached document by id", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sleep-truth-cache-"));
    await writeDocs(dir, [doc]);
    await writeDocs(dir, [{ ...doc, total_sleep_duration: 42 }]);
    await expect(readDocs(dir)).resolves.toEqual([{ ...doc, total_sleep_duration: 42 }]);
  });

  it("honours XDG directories", () => {
    expect(paths({ XDG_CONFIG_HOME: "/config", XDG_DATA_HOME: "/data" })).toEqual({
      config: "/config/sleep-truth/config.json", tokens: "/config/sleep-truth/tokens.json", dataDir: "/data/sleep-truth", cacheDir: "/data/sleep-truth/oura/sleep",
    });
  });

  it("defaults to home config and local share directories", () => {
    expect(paths({ HOME: "/home/test" })).toEqual({
      config: "/home/test/.config/sleep-truth/config.json", tokens: "/home/test/.config/sleep-truth/tokens.json", dataDir: "/home/test/.local/share/sleep-truth", cacheDir: "/home/test/.local/share/sleep-truth/oura/sleep",
    });
  });
});

describe("cache privacy and damage", () => {
  it("keeps the cache readable only by the user", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "sleep-truth-cache-")), "sleep");
    await mkdir(dir, { mode: 0o755 });
    await writeFile(join(dir, "old.json"), "{}", { mode: 0o644 });
    await writeDocs(dir, [doc]);
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
    const written = (await readdir(dir)).filter((name) => name !== "old.json");
    expect((await stat(join(dir, written[0]!))).mode & 0o777).toBe(0o600);
  });

  it("skips a damaged file and names it instead of failing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sleep-truth-cache-"));
    await writeDocs(dir, [doc]);
    await writeFile(join(dir, "broken.json"), "{ not json");
    const damaged: string[] = [];
    await expect(readDocs(dir, (file) => damaged.push(file))).resolves.toEqual([doc]);
    expect(damaged).toEqual([join(dir, "broken.json")]);
  });
});

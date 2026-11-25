import { mkdtemp } from "node:fs/promises";
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
      config: "/config/sleep-truth/config.json", tokens: "/config/sleep-truth/tokens.json", cacheDir: "/data/sleep-truth/oura/sleep",
    });
  });

  it("defaults to home config and local share directories", () => {
    expect(paths({ HOME: "/home/test" })).toEqual({
      config: "/home/test/.config/sleep-truth/config.json", tokens: "/home/test/.config/sleep-truth/tokens.json", cacheDir: "/home/test/.local/share/sleep-truth/oura/sleep",
    });
  });
});

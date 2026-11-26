import { execFile } from "node:child_process";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execute = promisify(execFile);
const cwd = new URL("../", import.meta.url).pathname;

async function run(args: string[]) {
  const dir = await mkdtemp(join(tmpdir(), "sleep-truth-main-"));
  const env = { ...process.env, XDG_CONFIG_HOME: join(dir, "config"), XDG_DATA_HOME: join(dir, "data") };
  const result = await execute("node", ["src/main.ts", ...args], { cwd, env }).then(
    (ok) => ({ ...ok, code: 0 }),
    (error: { stdout: string; stderr: string; code: number }) => error,
  );
  return { ...result, dir };
}

describe("CLI entrypoint", () => {
  it("prints usage, ignoring a leading -- argument separator", async () => {
    const result = await execute("node", ["src/main.ts", "--", "--help"], { cwd });
    expect(result.stdout).toContain("Usage:");
  });

  it("points at the setup guide when there is no settings file", async () => {
    const result = await run(["sync"]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/No settings file.*https:\/\/sleep-truth\.agh1973\.com\/start\//s);
  });

  it("rejects a malformed --since before doing anything", async () => {
    const result = await run(["sync", "--since", "last week"]);
    expect(result.stderr).toMatch(/--since must be a date as YYYY-MM-DD/);
  });

  it("writes the export readable only by the user", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sleep-truth-main-"));
    const output = join(dir, "out.nights.json");
    const result = await run(["export", "--from", "2026-01-01", "--to", "2026-01-02", "-o", output]);
    expect(result.code).toBe(0);
    expect((await stat(output)).mode & 0o777).toBe(0o600);
  });
});

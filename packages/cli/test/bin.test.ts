import { execFile } from "node:child_process";
import { mkdtemp, realpath, stat, symlink } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execute = promisify(execFile);
const wrapper = fileURLToPath(new URL("../../../bin/sleep-truth", import.meta.url));

describe("bin/sleep-truth", () => {
  it("runs the CLI through a symlink from any directory", async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), "sleep-truth-bin-")));
    const link = join(dir, "sleep-truth");
    await symlink(wrapper, link);
    const result = await execute(link, ["--help"], { cwd: dir });
    expect(result.stdout).toContain("sleep-truth forget");
  });

  it("writes a relative output path in the caller's working directory", async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), "sleep-truth-bin-")));
    // mise keeps its installs under XDG_DATA_HOME too, so pin its own data dir first.
    const miseData = process.env.MISE_DATA_DIR ?? join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "mise");
    const env = { ...process.env, MISE_DATA_DIR: miseData, XDG_DATA_HOME: join(dir, "data") };
    await execute(wrapper, ["export", "--from", "2026-01-01", "--to", "2026-01-02", "-o", "out.nights.json"], { cwd: dir, env });
    await expect(stat(join(dir, "out.nights.json"))).resolves.toBeTruthy();
  });
});

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execute = promisify(execFile);

describe("CLI entrypoint", () => {
  it("prints usage through pnpm's -- argument separator", async () => {
    const result = await execute("node", ["src/main.ts", "--", "--help"], { cwd: new URL("../", import.meta.url).pathname });
    expect(result.stdout).toContain("Usage:");
  });
});

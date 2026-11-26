import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { renderReport } from "../src/app.ts";

const execute = promisify(execFile);
const root = fileURLToPath(new URL("../../../", import.meta.url));

describe("scripts/sample-nights.ts", () => {
  it("writes a file the page renders", async () => {
    const { stdout } = await execute("node", ["scripts/sample-nights.ts"], { cwd: root });
    const report = renderReport(stdout, { region: { country: "CA", state: "BC" }, palette: "mono" });
    expect(report.error).toBeUndefined();
    expect(report.pages.length).toBeGreaterThan(0);
  });
});

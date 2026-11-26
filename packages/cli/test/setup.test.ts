import { mkdtemp, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { readConfig } from "../src/config.ts";
import { setup } from "../src/setup.ts";

async function answer(path: string, lines: string[]): Promise<string> {
  const input = new PassThrough();
  const output = new PassThrough();
  let printed = "";
  output.on("data", (chunk) => { printed += String(chunk); });
  const pending = setup(path, input, output);
  for (const line of lines) input.write(`${line}\n`);
  await pending;
  input.destroy();
  return printed;
}

describe("setup", () => {
  it("writes a settings file the CLI can read, readable only by the user", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "sleep-truth-setup-")), "sleep-truth");
    const path = join(dir, "config.json");
    await answer(path, ["  my-client-id ", "my secret"]);
    await expect(readConfig(path)).resolves.toMatchObject({ client_id: "my-client-id", client_secret: "my secret" });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
  });

  it("keeps other settings already in the file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sleep-truth-setup-"));
    const path = join(dir, "config.json");
    await writeFile(path, JSON.stringify({ client_id: "old", client_secret: "old", redirect_port: 9000 }));
    await answer(path, ["new-id", "new-secret"]);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ client_id: "new-id", client_secret: "new-secret", redirect_port: 9000 });
  });

  it("refuses an empty answer", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sleep-truth-setup-"));
    await mkdir(dir, { recursive: true });
    await expect(answer(join(dir, "config.json"), ["", "x"])).rejects.toThrow(/Client ID/);
  });
});

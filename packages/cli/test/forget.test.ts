import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { forget } from "../src/forget.ts";
import type { Paths } from "../src/paths.ts";

async function fixture(): Promise<Paths> {
  const root = await mkdtemp(join(tmpdir(), "sleep-truth-forget-"));
  const configDir = join(root, "config");
  const dataDir = join(root, "data", "sleep-truth");
  await mkdir(configDir, { recursive: true });
  await mkdir(join(dataDir, "oura", "sleep"), { recursive: true });
  return { config: join(configDir, "config.json"), tokens: join(configDir, "tokens.json"), dataDir, cacheDir: join(dataDir, "oura", "sleep") };
}

describe("forget", () => {
  it("revokes the access token with Oura's documented GET request", async () => {
    const location = await fixture();
    await writeFile(location.tokens, JSON.stringify({ access_token: "token value", refresh_token: "refresh", expires_at: 1 }));
    let request: Request | undefined;
    await forget(location, async (input, init) => {
      request = new Request(input, init);
      return new Response(null, { status: 200 });
    }, () => {});
    expect(request?.url).toBe("https://api.ouraring.com/oauth/revoke?access_token=token+value");
    expect(request?.method).toBe("GET");
    expect(request?.headers.get("User-Agent")).toBe("sleep-truth/0.1");
  });

  it("deletes local tokens and data after a revoke failure while preserving config", async () => {
    const location = await fixture();
    await writeFile(location.config, "secret config");
    await writeFile(location.tokens, JSON.stringify({ access_token: "token", refresh_token: "refresh", expires_at: 1 }));
    await writeFile(join(location.cacheDir, "raw.json"), "synthetic");
    const messages: string[] = [];
    await forget(location, async () => { throw new Error("offline"); }, (message) => messages.push(message));
    await expect(access(location.tokens)).rejects.toThrow();
    await expect(access(location.dataDir)).rejects.toThrow();
    await expect(readFile(location.config, "utf8")).resolves.toBe("secret config");
    expect(messages.join("\n")).toMatch(/cloud\.ouraring\.com/);
  });

  it("succeeds when there is nothing left to remove", async () => {
    const location = await fixture();
    await forget(location, async () => new Response(null, { status: 200 }), () => {});
    await forget(location, async () => new Response(null, { status: 200 }), () => {});
  });
});

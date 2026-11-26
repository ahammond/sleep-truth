import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { codeFrom, waitForCallback } from "../src/callback.ts";

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(typeof address === "object" && address ? address.port : 0));
    });
  });
}

function started(port: number, timeoutMs?: number) {
  let ready!: () => void;
  const listening = new Promise<void>((resolve) => { ready = resolve; });
  const result = waitForCallback({ port, expectedState: "good", onListening: ready, timeoutMs });
  result.catch(() => {});
  return { listening, result };
}

describe("codeFrom", () => {
  it("returns the code when the state matches", () => {
    expect(codeFrom(new URL("http://localhost/callback?state=good&code=abc"), "good")).toBe("abc");
  });
  it("rejects another sign-in's state", () => {
    expect(() => codeFrom(new URL("http://localhost/callback?state=bad&code=abc"), "good")).toThrow(/did not come from this sign-in/);
  });
  it("reports a declined sign-in", () => {
    expect(() => codeFrom(new URL("http://localhost/callback?state=good&error=access_denied"), "good")).toThrow(/access_denied.*sleep-truth login/);
  });
});

describe("waitForCallback", () => {
  it("answers success only after the state checks out", async () => {
    const port = await freePort();
    const { listening, result } = started(port);
    await listening;
    const response = await fetch(`http://127.0.0.1:${port}/callback?state=good&code=abc`);
    expect(response.status).toBe(200);
    expect(await response.text()).toMatch(/complete/);
    await expect(result).resolves.toBeInstanceOf(URL);
  });

  it("answers failure and rejects on a wrong state", async () => {
    const port = await freePort();
    const { listening, result } = started(port);
    await listening;
    const response = await fetch(`http://127.0.0.1:${port}/callback?state=bad&code=abc`);
    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/failed/);
    await expect(result).rejects.toThrow(/did not come from this sign-in/);
  });

  it("answers on the IPv6 loopback too", async () => {
    const port = await freePort();
    const { listening, result } = started(port);
    await listening;
    const response = await fetch(`http://[::1]:${port}/callback?state=good&code=abc`);
    expect(response.status).toBe(200);
    await expect(result).resolves.toBeInstanceOf(URL);
  });

  it("gives up after the timeout", async () => {
    const port = await freePort();
    const { result } = started(port, 50);
    await expect(result).rejects.toThrow(/No sign-in arrived.*sleep-truth login/);
  });
});

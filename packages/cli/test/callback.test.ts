import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { codeFrom, waitForCallback } from "../src/callback.ts";

// Some hosts (many CI containers) have no IPv6 loopback; the code tolerates that, so the test does too.
const hasIpv6Loopback = await new Promise<boolean>((resolve) => {
  const probe = createServer();
  probe.once("error", () => resolve(false));
  probe.listen(0, "::1", () => probe.close(() => resolve(true)));
});

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

  it("answers a stray request and keeps waiting for the real redirect", async () => {
    const port = await freePort();
    const { listening, result } = started(port);
    await listening;
    const stray = await fetch(`http://127.0.0.1:${port}/callback?state=bad&code=abc`);
    expect(stray.status).toBe(400);
    const real = await fetch(`http://127.0.0.1:${port}/callback?state=good&code=abc`);
    expect(real.status).toBe(200);
    await expect(result).resolves.toBeInstanceOf(URL);
  });

  it("rejects a declined sign-in", async () => {
    const port = await freePort();
    const { listening, result } = started(port);
    await listening;
    const response = await fetch(`http://127.0.0.1:${port}/callback?state=good&error=access_denied`);
    expect(response.status).toBe(400);
    await expect(result).rejects.toThrow(/access_denied/);
  });

  it("suggests --paste when the port is taken", async () => {
    const port = await freePort();
    const blocker = createServer().listen(port, "127.0.0.1");
    await new Promise((resolve) => blocker.once("listening", resolve));
    const { result } = started(port);
    await expect(result).rejects.toThrow(/sleep-truth login --paste/);
    blocker.close();
  });

  it.skipIf(!hasIpv6Loopback)("answers on the IPv6 loopback too", async () => {
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

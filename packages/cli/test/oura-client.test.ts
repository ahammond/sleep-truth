import { describe, expect, it } from "vitest";
import { OuraClient } from "../src/oura-client.ts";

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

describe("OuraClient", () => {
  it("follows every next_token page with required headers", async () => {
    const requests: Request[] = [];
    const pages = [
      { data: [{ id: "a" }], next_token: "second" },
      { data: [{ id: "b" }], next_token: "third" },
      { data: [{ id: "c" }] },
    ];
    const client = new OuraClient(async () => "token", async (input, init) => {
      requests.push(new Request(input, init));
      return json(pages[requests.length - 1]);
    });
    const docs = await client.listSleep("2026-01-01", "2026-01-03");
    expect(docs.map((doc) => doc.id)).toEqual(["a", "b", "c"]);
    expect(requests).toHaveLength(3);
    expect(requests.map((request) => request.headers.get("user-agent"))).toEqual(["sleep-truth/0.1", "sleep-truth/0.1", "sleep-truth/0.1"]);
    expect(requests.map((request) => request.headers.get("authorization"))).toEqual(["Bearer token", "Bearer token", "Bearer token"]);
    expect(new URL(requests[1]!.url).searchParams.get("next_token")).toBe("second");
  });

  it("requests a refreshed token once after a 401", async () => {
    const forced: boolean[] = [];
    let attempts = 0;
    const client = new OuraClient(async (forceRefresh) => {
      forced.push(forceRefresh === true);
      return forceRefresh ? "fresh" : "expired";
    }, async (_input, init) => {
      attempts++;
      return attempts === 1 ? json({}, 401) : json({ data: [{ id: "a" }] });
    });
    await expect(client.listSleep("2026-01-01", "2026-01-02")).resolves.toEqual([{ id: "a" }]);
    expect(forced).toEqual([false, true]);
  });

  it("retries 429 using Retry-After", async () => {
    let attempts = 0;
    const slept: number[] = [];
    const client = new OuraClient(async () => "token", async () => {
      attempts++;
      return attempts === 1 ? json({}, 429, { "Retry-After": "0" }) : json({ data: [{ id: "a" }] });
    }, async (ms) => { slept.push(ms); });
    await expect(client.listSleep("2026-01-01", "2026-01-02")).resolves.toEqual([{ id: "a" }]);
    expect(slept).toEqual([0]);
  });

  it("fails clearly after three rate-limit retries", async () => {
    const client = new OuraClient(async () => "token", async () => json({}, 429), async () => {});
    await expect(client.listSleep("2026-01-01", "2026-01-02")).rejects.toThrow(/rate limit.*3/i);
  });
});

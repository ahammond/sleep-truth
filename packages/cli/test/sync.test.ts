import { describe, expect, it } from "vitest";
import type { OuraSleepDoc } from "@sleep-truth/core";
import type { Config, Tokens } from "../src/auth.ts";
import { syncWindow, tokenSource } from "../src/sync.ts";

const now = Date.parse("2026-11-26T18:00:00Z");
const doc = (day: string) => ({ id: day, day }) as unknown as OuraSleepDoc;
const config: Config = { client_id: "id", client_secret: "secret", redirect_port: 8765 };

describe("syncWindow", () => {
  it("takes a year on the first sync", () => {
    expect(syncWindow([], undefined, now)).toEqual({ start: "2025-11-26", end: "2026-11-28" });
  });
  it("starts 3 days before the newest saved night", () => {
    expect(syncWindow([doc("2026-11-01"), doc("2026-11-20")], undefined, now).start).toBe("2026-11-17");
  });
  it("uses --since as given", () => {
    expect(syncWindow([doc("2026-11-20")], "2026-01-15", now).start).toBe("2026-01-15");
  });
  it("ends past today in the furthest-east time zone", () => {
    // 23:30 UTC is already the next day in UTC+14.
    expect(syncWindow([], undefined, Date.parse("2026-11-26T23:30:00Z")).end > "2026-11-27").toBe(true);
  });
});

describe("tokenSource", () => {
  const fresh: Tokens = { access_token: "a1", refresh_token: "r1", expires_at: now + 3_600_000 };

  it("reuses a token that is not about to expire", async () => {
    let refreshed = 0;
    const get = tokenSource(config, fresh, async () => {}, () => now, async () => { refreshed++; return fresh; });
    await expect(get()).resolves.toBe("a1");
    expect(refreshed).toBe(0);
  });

  it("refreshes a token within 5 minutes of expiry and saves the new pair before using it", async () => {
    const events: string[] = [];
    const rotated: Tokens = { access_token: "a2", refresh_token: "r2", expires_at: now + 3_600_000 };
    const get = tokenSource(config, { ...fresh, expires_at: now + 60_000 }, async (t) => { events.push(`save ${t.refresh_token}`); }, () => now, async (_c, t) => { events.push(`refresh ${t.refresh_token}`); return rotated; });
    await expect(get()).resolves.toBe("a2");
    await expect(get()).resolves.toBe("a2");
    expect(events).toEqual(["refresh r1", "save r2"]);
  });

  it("refreshes when forced, using the latest refresh token", async () => {
    const seen: string[] = [];
    let n = 0;
    const get = tokenSource(config, fresh, async () => {}, () => now, async (_c, t) => { seen.push(t.refresh_token); n++; return { access_token: `a${n + 1}`, refresh_token: `r${n + 1}`, expires_at: now + 3_600_000 }; });
    await get(true);
    await get(true);
    expect(seen).toEqual(["r1", "r2"]);
  });
});

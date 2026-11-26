import type { OuraSleepDoc } from "@sleep-truth/core";
import { refresh as refreshTokens, type Config, type Tokens } from "./auth.ts";

const DAY_MS = 86_400_000;
const REFRESH_EARLY_MS = 5 * 60_000;

function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number): string {
  return utcDate(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS);
}

/**
 * The dates to ask Oura for. A first sync takes a year. Later syncs start 3 days
 * before the newest saved night, because Oura revises recent nights. The end is
 * 2 days past today in UTC, so it covers "today" in every time zone even if
 * Oura treats end_date as exclusive.
 */
export function syncWindow(docs: OuraSleepDoc[], since: string | undefined, now: number): { start: string; end: string } {
  const today = utcDate(now);
  const newest = docs.map((doc) => doc.day).filter((day): day is string => typeof day === "string").sort().at(-1);
  const start = since ?? (newest ? shiftDate(newest, -3) : shiftDate(today, -365));
  return { start, end: shiftDate(today, 2) };
}

/**
 * Hands out an access token, refreshing it when it is about to expire or when
 * forced. Oura rotates the refresh token, so the new pair is saved before it is used.
 */
export function tokenSource(
  config: Config,
  initial: Tokens,
  save: (tokens: Tokens) => Promise<void>,
  now: () => number = Date.now,
  refresh: (config: Config, tokens: Tokens) => Promise<Tokens> = (c, t) => refreshTokens(c, t),
): (forceRefresh?: boolean) => Promise<string> {
  let tokens = initial;
  return async (forceRefresh = false) => {
    if (forceRefresh || tokens.expires_at - now() < REFRESH_EARLY_MS) {
      const rotated = await refresh(config, tokens);
      await save(rotated);
      tokens = rotated;
    }
    return tokens.access_token;
  };
}

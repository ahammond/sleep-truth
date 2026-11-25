import type { OuraSleepDoc } from "@sleep-truth/core";
import type { FetchFn } from "./auth.ts";

type SleepResponse = { data?: OuraSleepDoc[]; next_token?: string };
export type SleepFn = (milliseconds: number) => Promise<void>;

const endpoint = "https://api.ouraring.com/v2/usercollection/sleep";
const sleepFor: SleepFn = async (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class OuraClient {
  private readonly getToken: (forceRefresh?: boolean) => Promise<string>;
  private readonly fetchFn: FetchFn;
  private readonly sleep: SleepFn;

  constructor(getToken: (forceRefresh?: boolean) => Promise<string>, fetchFn: FetchFn = fetch, sleep: SleepFn = sleepFor) {
    this.getToken = getToken;
    this.fetchFn = fetchFn;
    this.sleep = sleep;
  }

  async listSleep(start: string, end: string): Promise<OuraSleepDoc[]> {
    const docs: OuraSleepDoc[] = [];
    let nextToken: string | undefined;
    do {
      const page = await this.fetchPage(start, end, nextToken);
      docs.push(...page.data);
      nextToken = page.next_token;
    } while (nextToken);
    return docs;
  }

  private async fetchPage(start: string, end: string, nextToken?: string): Promise<{ data: OuraSleepDoc[]; next_token?: string }> {
    let retry429 = 0;
    let retry401 = false;
    for (;;) {
      const query = new URLSearchParams({ start_date: start, end_date: end });
      if (nextToken) query.set("next_token", nextToken);
      const response = await this.fetchFn(`${endpoint}?${query}`, {
        headers: { Authorization: `Bearer ${await this.getToken(retry401)}`, "User-Agent": "sleep-truth/0.1" },
      });
      if (response.status === 401 && !retry401) {
        retry401 = true;
        continue;
      }
      if (response.status === 429) {
        if (retry429 >= 3) throw new Error("Oura rate limit persisted after 3 retries");
        retry429++;
        const seconds = Number(response.headers.get("Retry-After") ?? "30");
        await this.sleep((Number.isFinite(seconds) && seconds >= 0 ? seconds : 30) * 1000);
        continue;
      }
      if (!response.ok) throw new Error(`Oura sleep request failed: ${response.status} ${response.statusText}`);
      const body: unknown = await response.json();
      if (!isSleepResponse(body)) throw new Error("Oura sleep response has invalid data");
      return { data: body.data ?? [], next_token: body.next_token };
    }
  }
}

function isSleepResponse(value: unknown): value is SleepResponse {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (record.data === undefined || Array.isArray(record.data)) && (record.next_token === undefined || typeof record.next_token === "string");
}

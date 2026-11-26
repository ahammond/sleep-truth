import { rm } from "node:fs/promises";
import { readTokens, type FetchFn } from "./auth.ts";
import type { Paths } from "./paths.ts";

const revokeEndpoint = "https://api.ouraring.com/oauth/revoke";

export async function revokeAccessToken(accessToken: string, fetchFn: FetchFn = fetch): Promise<void> {
  const url = new URL(revokeEndpoint);
  url.searchParams.set("access_token", accessToken);
  const response = await fetchFn(url, { headers: { "User-Agent": "sleep-truth/0.1" } });
  if (!response.ok) throw new Error(`Oura access-token revocation failed: ${response.status} ${response.statusText}`);
}

export async function forget(location: Paths, fetchFn: FetchFn = fetch, print: (message: string) => void = console.log): Promise<void> {
  try {
    const tokens = await readTokens(location.tokens);
    try {
      await revokeAccessToken(tokens.access_token, fetchFn);
      print("Revoked the Oura access token.");
    } catch {
      print("Could not revoke the Oura access token. Remove Sleep Truth's access in the Oura app or at cloud.ouraring.com.");
    }
  } catch (error: unknown) {
    if (!(error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT")) {
      print("Could not read the local token file. It will still be deleted.");
    }
  }
  await rm(location.tokens, { force: true });
  await rm(location.dataDir, { recursive: true, force: true });
  print(`Deleted ${location.tokens} and ${location.dataDir}.`);
  print("Kept config.json because it holds your Oura app client ID and secret, not your health data.");
  print("Delete any nights files you exported yourself, including files made with export -o.");
}

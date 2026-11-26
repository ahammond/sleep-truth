import { isAbsolute } from "node:path";
import { rm } from "node:fs/promises";
import { NotSignedInError, readTokens, refresh, USER_AGENT, type FetchFn, type Tokens } from "./auth.ts";
import { readConfig } from "./config.ts";
import type { Paths } from "./paths.ts";

const revokeEndpoint = "https://api.ouraring.com/oauth/revoke";
const REVOKE_BY_HAND = "Remove Sleep Truth's access in the Oura app or at cloud.ouraring.com.";

export async function revokeAccessToken(accessToken: string, fetchFn: FetchFn = fetch): Promise<void> {
  const url = new URL(revokeEndpoint);
  url.searchParams.set("access_token", accessToken);
  const response = await fetchFn(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`Oura access-token revocation failed: ${response.status} ${response.statusText}`);
}

/** The stored access token, renewed first when it has expired, since Oura may not revoke an expired one. */
async function currentAccessToken(location: Paths, tokens: Tokens, fetchFn: FetchFn): Promise<string> {
  if (tokens.expires_at > Date.now()) return tokens.access_token;
  try {
    return (await refresh(await readConfig(location.config), tokens, fetchFn)).access_token;
  } catch {
    return tokens.access_token;
  }
}

export async function forget(location: Paths, fetchFn: FetchFn = fetch, print: (message: string) => void = console.log): Promise<void> {
  for (const path of [location.tokens, location.dataDir]) {
    if (!isAbsolute(path)) throw new Error(`Refusing to delete ${path}: it is not an absolute path.`);
  }
  let tokens: Tokens | undefined;
  try {
    tokens = await readTokens(location.tokens);
  } catch (error: unknown) {
    if (!(error instanceof NotSignedInError)) print(`Could not read the saved sign-in, so it cannot be cancelled from here. ${REVOKE_BY_HAND}`);
  }
  if (tokens) {
    try {
      await revokeAccessToken(await currentAccessToken(location, tokens, fetchFn), fetchFn);
      print("Cancelled Sleep Truth's access with Oura.");
    } catch {
      print(`Could not cancel the access with Oura. ${REVOKE_BY_HAND}`);
    }
  }
  await rm(location.tokens, { force: true });
  await rm(location.dataDir, { recursive: true, force: true });
  print(`Deleted ${location.tokens} and ${location.dataDir}.`);
  print("Kept config.json because it holds your Oura app client ID and secret, not your health data.");
  print("Delete any nights files you exported yourself, including files made with export -o.");
}

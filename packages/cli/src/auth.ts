import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface Config {
  client_id: string;
  client_secret: string;
  redirect_port: number;
  redirect_uri?: string;
}

export interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Now = () => number;

function redirectUri(config: Config): string {
  return config.redirect_uri ?? `http://localhost:${config.redirect_port}/callback`;
}

export function validateRedirectUri(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Config redirect_uri must be an absolute http or https URL");
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.host) {
    throw new Error("Config redirect_uri must be an absolute http or https URL");
  }
  return value;
}

export function usesPasteMode(config: Config, requested: boolean): boolean {
  if (requested || !config.redirect_uri) return requested;
  const host = new URL(config.redirect_uri).hostname;
  return host !== "localhost" && host !== "127.0.0.1";
}

export function authorizeUrl(config: Config, state: string, challenge: string): string {
  const query = new URLSearchParams({
    response_type: "code",
    redirect_uri: redirectUri(config),
    scope: "daily",
    code_challenge_method: "S256",
    client_id: config.client_id,
    state,
    code_challenge: challenge,
  });
  return `https://cloud.ouraring.com/oauth/authorize?${query}`;
}

async function tokenRequest(config: Config, body: Record<string, string>, fetchFn: FetchFn, now: Now): Promise<Tokens> {
  const response = await fetchFn("https://api.ouraring.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...body, client_id: config.client_id, client_secret: config.client_secret }),
  });
  if (!response.ok) throw new Error(`Oura token request failed: ${response.status} ${response.statusText}`);
  const value: unknown = await response.json();
  if (!isTokenResponse(value)) throw new Error("Oura token response is missing required fields");
  return { access_token: value.access_token, refresh_token: value.refresh_token, expires_at: now() + value.expires_in * 1000 };
}

function isTokenResponse(value: unknown): value is { access_token: string; refresh_token: string; expires_in: number } {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.access_token === "string" && typeof record.refresh_token === "string" && typeof record.expires_in === "number";
}

export function exchangeCode(config: Config, code: string, verifier: string, fetchFn: FetchFn = fetch, now: Now = Date.now): Promise<Tokens> {
  return tokenRequest(config, { grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri(config) }, fetchFn, now);
}

export function refresh(config: Config, tokens: Tokens, fetchFn: FetchFn = fetch, now: Now = Date.now): Promise<Tokens> {
  return tokenRequest(config, { grant_type: "refresh_token", refresh_token: tokens.refresh_token }, fetchFn, now);
}

export async function writeTokens(path: string, tokens: Tokens): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(tokens, null, 2) + "\n", { mode: 0o600 });
  await chmod(path, 0o600);
}

export async function readTokens(path: string): Promise<Tokens> {
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isStoredTokens(value)) throw new Error(`Invalid tokens file: ${path}`);
  return value;
}

function isStoredTokens(value: unknown): value is Tokens {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.access_token === "string" && typeof record.refresh_token === "string" && typeof record.expires_at === "number";
}

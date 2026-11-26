import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { authorizeUrl, exchangeCode, loopbackCallback, readTokens, refresh, usesPasteMode, validateRedirectUri, writeTokens, type Config, type Tokens } from "../src/auth.ts";

const config: Config = { client_id: "client id", client_secret: "secret value", redirect_port: 8765 };

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}

describe("auth", () => {
  it("builds an encoded authorization URL with all required parameters", () => {
    const url = new URL(authorizeUrl(config, "state value", "challenge+/="));
    expect(url.origin + url.pathname).toBe("https://cloud.ouraring.com/oauth/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      redirect_uri: "http://localhost:8765/callback",
      scope: "daily",
      code_challenge_method: "S256",
      client_id: "client id",
      state: "state value",
      code_challenge: "challenge+/=",
    });
  });

  it("uses a configured redirect URI for authorization and exchange", async () => {
    const custom = { ...config, redirect_uri: "https://sleep-truth.agh1973.com/callback/" };
    expect(new URL(authorizeUrl(custom, "state", "challenge")).searchParams.get("redirect_uri")).toBe(custom.redirect_uri);
    let request: Request | undefined;
    await exchangeCode(custom, "code", "verifier", async (input, init) => {
      request = new Request(input, init);
      return response({ access_token: "access", refresh_token: "refresh", expires_in: 60 });
    });
    expect(new URLSearchParams(await request?.text()).get("redirect_uri")).toBe(custom.redirect_uri);
  });

  it("uses paste mode for a non-loopback redirect URI", () => {
    expect(usesPasteMode({ ...config, redirect_uri: "https://sleep-truth.agh1973.com/callback/" }, false)).toBe(true);
    expect(usesPasteMode(config, false)).toBe(false);
    expect(usesPasteMode(config, true)).toBe(true);
  });

  it("rejects a relative or non-http redirect URI", () => {
    expect(() => validateRedirectUri("/callback")).toThrow(/absolute http/i);
    expect(() => validateRedirectUri("ftp://localhost/callback")).toThrow(/absolute http/i);
  });

  it("exchanges an authorization code with a form post", async () => {
    let request: Request | undefined;
    const tokens = await exchangeCode(config, "the code", "verifier", async (input, init) => {
      request = new Request(input, init);
      return response({ access_token: "access", refresh_token: "refresh", expires_in: 60 });
    }, () => 1_000);
    expect(tokens).toEqual({ access_token: "access", refresh_token: "refresh", expires_at: 61_000 });
    expect(request?.url).toBe("https://api.ouraring.com/oauth/token");
    expect(request?.method).toBe("POST");
    expect(request?.headers.get("content-type")).toContain("application/x-www-form-urlencoded");
    expect(Object.fromEntries(new URLSearchParams(await request?.text()))).toEqual({
      grant_type: "authorization_code", code: "the code", code_verifier: "verifier",
      redirect_uri: "http://localhost:8765/callback", client_id: "client id", client_secret: "secret value",
    });
  });

  it("refreshes with the rotated refresh token", async () => {
    let request: Request | undefined;
    const tokens = await refresh(config, { access_token: "old", refresh_token: "old refresh", expires_at: 0 }, async (input, init) => {
      request = new Request(input, init);
      return response({ access_token: "new", refresh_token: "rotated", expires_in: 30 });
    }, () => 500);
    expect(tokens).toEqual({ access_token: "new", refresh_token: "rotated", expires_at: 30_500 });
    expect(Object.fromEntries(new URLSearchParams(await request?.text()))).toMatchObject({ grant_type: "refresh_token", refresh_token: "old refresh" });
  });

  it("writes tokens with mode 0600", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sleep-truth-auth-"));
    const path = join(dir, "tokens.json");
    const tokens: Tokens = { access_token: "access", refresh_token: "refresh", expires_at: 1 };
    await writeTokens(path, tokens);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(tokens);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });
});

describe("sign-in failures tell the user what to run", () => {
  it("says to log in when there are no tokens yet", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sleep-truth-auth-"));
    await expect(readTokens(join(dir, "tokens.json"))).rejects.toThrow(/Not signed in.*sleep-truth login/);
  });

  it("says to log in when Oura will not renew the sign-in", async () => {
    const tokens: Tokens = { access_token: "a", refresh_token: "revoked", expires_at: 0 };
    const rejected = async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
    await expect(refresh(config, tokens, rejected)).rejects.toThrow(/sleep-truth login/);
  });
});

describe("loopbackCallback", () => {
  it("listens where the default redirect points", () => {
    expect(loopbackCallback(config)).toEqual({ port: 8765, path: "/callback" });
  });
  it("follows a localhost redirect_uri's own port and path", () => {
    expect(loopbackCallback({ ...config, redirect_uri: "http://localhost:9000/cb" })).toEqual({ port: 9000, path: "/cb" });
    expect(loopbackCallback({ ...config, redirect_uri: "http://127.0.0.1/callback" })).toEqual({ port: 80, path: "/callback" });
  });
});

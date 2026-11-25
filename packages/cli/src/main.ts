import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { spawn } from "node:child_process";
import { authorizeUrl, exchangeCode, readTokens, refresh, writeTokens, type Config, type Tokens } from "./auth.ts";
import { readDocs, writeDocs } from "./cache.ts";
import { exportNights } from "./export.ts";
import { OuraClient } from "./oura-client.ts";
import { readPastedUrl } from "./paste.ts";
import { paths } from "./paths.ts";

const usage = `Usage:
  sleep-truth login [--paste]
  sleep-truth sync [--since YYYY-MM-DD]
  sleep-truth export --from YYYY-MM-DD --to YYYY-MM-DD -o FILE`;

function configFrom(value: unknown): Config {
  if (typeof value !== "object" || value === null) throw new Error("Invalid config file");
  const record = value as Record<string, unknown>;
  if (typeof record.client_id !== "string" || typeof record.client_secret !== "string") throw new Error("Config requires client_id and client_secret");
  if (record.redirect_port !== undefined && (typeof record.redirect_port !== "number" || !Number.isInteger(record.redirect_port))) throw new Error("Config redirect_port must be an integer");
  return { client_id: record.client_id, client_secret: record.client_secret, redirect_port: record.redirect_port ?? 8765 };
}

async function readConfig(path: string): Promise<Config> {
  return configFrom(JSON.parse(await readFile(path, "utf8")));
}

function verifier(): string {
  return randomBytes(32).toString("base64url");
}

function challenge(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

async function redirectedUrlFromServer(port: number, expectedState: string, onListening: () => void): Promise<URL> {
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", `http://localhost:${port}`);
      if (url.pathname !== "/callback") { response.writeHead(404).end(); return; }
      response.setHeader("content-type", "text/plain");
      response.end("Sleep Truth login complete. You can close this tab.");
      server.close();
      if (url.searchParams.get("state") !== expectedState) reject(new Error("OAuth state did not match"));
      else resolve(url);
    });
    server.once("error", reject);
    server.listen(port, "127.0.0.1", onListening);
  });
}


function openUrl(url: string): void {
  const child = spawn("open", [url], { detached: true, stdio: "ignore" });
  child.unref();
}

async function login(paste: boolean): Promise<void> {
  const location = paths();
  const config = await readConfig(location.config);
  const state = randomBytes(24).toString("base64url");
  const codeVerifier = verifier();
  const url = authorizeUrl(config, state, challenge(codeVerifier));
  console.log(url);
  const callback = paste ? await readPastedUrl(process.stdin, process.stdout) : await redirectedUrlFromServer(config.redirect_port, state, () => openUrl(url));
  if (callback.searchParams.get("state") !== state) throw new Error("OAuth state did not match");
  const code = callback.searchParams.get("code");
  if (!code) throw new Error("OAuth callback did not include code");
  await writeTokens(location.tokens, await exchangeCode(config, code, codeVerifier));
  console.log("Login complete.");
}

function utcDate(date: Date): string { return date.toISOString().slice(0, 10); }
function shiftDate(date: string, days: number): string { return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10); }

async function sync(since: string | undefined): Promise<void> {
  const location = paths();
  const config = await readConfig(location.config);
  const docs = await readDocs(location.cacheDir);
  const newest = docs.map((doc) => doc.day).filter((day): day is string => typeof day === "string").sort().at(-1);
  const start = since ?? (newest ? shiftDate(newest, -3) : shiftDate(utcDate(new Date()), -365));
  // One day past today, in case Oura treats end_date as exclusive.
  const end = shiftDate(utcDate(new Date()), 1);
  let tokens: Tokens = await readTokens(location.tokens);
  const getToken = async (forceRefresh = false): Promise<string> => {
    if (forceRefresh || tokens.expires_at - Date.now() < 5 * 60_000) {
      const rotated = await refresh(config, tokens);
      await writeTokens(location.tokens, rotated);
      tokens = rotated;
    }
    return tokens.access_token;
  };
  const fetched = await new OuraClient(getToken).listSleep(start, end);
  await writeDocs(location.cacheDir, fetched);
  console.log(`synced ${fetched.length} periods from ${start} to ${end}`);
}

async function exportFile(from: string, to: string, output: string): Promise<void> {
  const result = exportNights(await readDocs(paths().cacheDir), from, to, new Date());
  await writeFile(output, JSON.stringify(result.file, null, 2) + "\n");
  console.log(`exported ${result.file.periods.length} periods (skipped ${result.skipped}) to ${output}`);
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] === "--") argv.shift();
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h") { console.log(usage); return; }
  if (command === "login") {
    const args = parseArgs({ args: rest, options: { paste: { type: "boolean", default: false } } });
    await login(args.values.paste);
    return;
  }
  if (command === "sync") {
    const args = parseArgs({ args: rest, options: { since: { type: "string" } } });
    await sync(args.values.since);
    return;
  }
  if (command === "export") {
    const args = parseArgs({ args: rest, options: { from: { type: "string" }, to: { type: "string" }, output: { type: "string", short: "o" } } });
    if (!args.values.from || !args.values.to || !args.values.output) throw new Error("export requires --from YYYY-MM-DD --to YYYY-MM-DD -o FILE");
    await exportFile(args.values.from, args.values.to, args.values.output);
    return;
  }
  throw new Error(`Unknown command: ${command}\n${usage}`);
}

void run().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });

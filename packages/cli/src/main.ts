import { createHash, randomBytes } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { spawn } from "node:child_process";
import { authorizeUrl, exchangeCode, readTokens, refresh, usesPasteMode, validateRedirectUri, writeTokens, type Config, type Tokens } from "./auth.ts";
import { readDocs, writeDocs } from "./cache.ts";
import { codeFrom, waitForCallback } from "./callback.ts";
import { checkDate, exportNights } from "./export.ts";
import { forget } from "./forget.ts";
import { OuraClient } from "./oura-client.ts";
import { readPastedUrl } from "./paste.ts";
import { paths } from "./paths.ts";

const usage = `Usage:
  sleep-truth login [--paste]
  sleep-truth sync [--since YYYY-MM-DD]
  sleep-truth export --from YYYY-MM-DD --to YYYY-MM-DD -o FILE
  sleep-truth forget`;

function configFrom(value: unknown): Config {
  if (typeof value !== "object" || value === null) throw new Error("Invalid config file");
  const record = value as Record<string, unknown>;
  if (typeof record.client_id !== "string" || typeof record.client_secret !== "string") throw new Error("Config requires client_id and client_secret");
  if (record.redirect_port !== undefined && (typeof record.redirect_port !== "number" || !Number.isInteger(record.redirect_port))) throw new Error("Config redirect_port must be an integer");
  if (record.redirect_uri !== undefined && typeof record.redirect_uri !== "string") throw new Error("Config redirect_uri must be a string");
  const redirect_uri = record.redirect_uri === undefined ? undefined : validateRedirectUri(record.redirect_uri);
  return { client_id: record.client_id, client_secret: record.client_secret, redirect_port: record.redirect_port ?? 8765, redirect_uri };
}

const GUIDE = "https://sleep-truth.agh1973.com/start/";

async function readConfig(path: string): Promise<Config> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`No settings file at ${path}.\nSet up your device first: ${GUIDE}`);
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`The settings file at ${path} is not valid JSON.\nSee ${GUIDE}`);
  }
  return configFrom(value);
}

function warnDamaged(file: string): void {
  console.error(`Skipped a damaged cache file: ${file}\nThe next sync over that date replaces it.`);
}

function verifier(): string {
  return randomBytes(32).toString("base64url");
}

function challenge(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
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
  const callback = usesPasteMode(config, paste)
    ? await readPastedUrl(process.stdin, process.stdout)
    : await waitForCallback({ port: config.redirect_port, expectedState: state, onListening: () => openUrl(url) });
  const code = codeFrom(callback, state);
  await writeTokens(location.tokens, await exchangeCode(config, code, codeVerifier));
  console.log("Login complete.");
}

function utcDate(date: Date): string { return date.toISOString().slice(0, 10); }
function shiftDate(date: string, days: number): string { return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10); }

async function sync(since: string | undefined): Promise<void> {
  if (since !== undefined) checkDate("--since", since);
  const location = paths();
  const config = await readConfig(location.config);
  const docs = await readDocs(location.cacheDir, warnDamaged);
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
  const result = exportNights(await readDocs(paths().cacheDir, warnDamaged), from, to, new Date());
  await writeFile(output, JSON.stringify(result.file, null, 2) + "\n", { mode: 0o600 });
  await chmod(output, 0o600);
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
  if (command === "forget") {
    if (rest.length > 0) throw new Error("forget does not take arguments");
    await forget(paths());
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

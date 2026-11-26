import { createHash, randomBytes } from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { spawn, spawnSync } from "node:child_process";
import { authorizeUrl, exchangeCode, loopbackCallback, readTokens, usesPasteMode, writeTokens } from "./auth.ts";
import { readConfig } from "./config.ts";
import { readDocs, writeDocs } from "./cache.ts";
import { codeFrom, waitForCallback } from "./callback.ts";
import { checkDate, exportNights } from "./export.ts";
import { forget } from "./forget.ts";
import { OuraClient } from "./oura-client.ts";
import { readPastedUrl } from "./paste.ts";
import { paths } from "./paths.ts";
import { setup } from "./setup.ts";
import { syncWindow, tokenSource } from "./sync.ts";

const usage = `Usage:
  sleep-truth setup
  sleep-truth login [--paste]
  sleep-truth sync [--since YYYY-MM-DD]
  sleep-truth export --from YYYY-MM-DD --to YYYY-MM-DD -o FILE
  sleep-truth forget`;

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
  // No `open` (not a Mac): the address is already printed, so carry on without a browser.
  child.on("error", () => {});
  child.unref();
}

async function login(paste: boolean): Promise<void> {
  const location = paths();
  const config = await readConfig(location.config);
  const state = randomBytes(24).toString("base64url");
  const codeVerifier = verifier();
  const url = authorizeUrl(config, state, challenge(codeVerifier));
  console.log(`Opening the sign-in page. If no browser opens, copy this address into one:\n${url}`);
  let callback: URL;
  if (usesPasteMode(config, paste)) {
    openUrl(url);
    callback = await readPastedUrl(process.stdin, process.stdout);
  } else {
    const { port, path } = loopbackCallback(config);
    callback = await waitForCallback({ port, path, expectedState: state, onListening: () => openUrl(url) });
  }
  const code = codeFrom(callback, state);
  await writeTokens(location.tokens, await exchangeCode(config, code, codeVerifier));
  console.log("Login complete.");
}

async function sync(since: string | undefined): Promise<void> {
  if (since !== undefined) checkDate("--since", since);
  const location = paths();
  const config = await readConfig(location.config);
  const docs = await readDocs(location.cacheDir, warnDamaged);
  const { start, end } = syncWindow(docs, since, Date.now());
  const getToken = tokenSource(config, await readTokens(location.tokens), (tokens) => writeTokens(location.tokens, tokens));
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
  if (command === "setup") {
    if (rest.length > 0) throw new Error("setup does not take arguments");
    const echo = (on: boolean): void => {
      if (process.stdin.isTTY) spawnSync("stty", [on ? "echo" : "-echo"], { stdio: ["inherit", "ignore", "ignore"] });
    };
    await setup(paths().config, process.stdin, process.stdout, echo);
    return;
  }
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

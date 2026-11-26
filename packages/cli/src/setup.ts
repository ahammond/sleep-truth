import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createInterface } from "node:readline/promises";

async function existing(path: string): Promise<Record<string, unknown>> {
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Asks for the device app's Client ID and Secret and writes the settings file, readable only by the user. */
export async function setup(path: string, input: NodeJS.ReadableStream, output: NodeJS.WritableStream): Promise<void> {
  // An async line iterator, not rl.question: pasted input can arrive faster than the prompts.
  const rl = createInterface({ input, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (prompt: string): Promise<string> => {
    output.write(prompt);
    const next = await lines.next();
    return next.done ? "" : String(next.value).trim();
  };
  let clientId: string;
  let clientSecret: string;
  try {
    clientId = await ask("Client ID: ");
    if (!clientId) throw new Error("The Client ID is empty. Copy it from your Oura app page and run setup again.");
    clientSecret = await ask("Client Secret: ");
    if (!clientSecret) throw new Error("The Client Secret is empty. Copy it from your Oura app page and run setup again.");
  } finally {
    rl.close();
  }
  const config = { ...(await existing(path)), client_id: clientId, client_secret: clientSecret };
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await chmod(dirname(path), 0o700);
  await writeFile(path, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  await chmod(path, 0o600);
  output.write(`Saved ${path}. Next, run: sleep-truth login\n`);
}

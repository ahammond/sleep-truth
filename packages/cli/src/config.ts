import { readFile } from "node:fs/promises";
import { validateRedirectUri, type Config } from "./auth.ts";

export const GUIDE = "https://sleep-truth.agh1973.com/start/";

export function configFrom(value: unknown): Config {
  if (typeof value !== "object" || value === null) throw new Error("Invalid config file");
  const record = value as Record<string, unknown>;
  if (typeof record.client_id !== "string" || typeof record.client_secret !== "string") throw new Error("Config requires client_id and client_secret");
  if (record.redirect_port !== undefined && (typeof record.redirect_port !== "number" || !Number.isInteger(record.redirect_port))) throw new Error("Config redirect_port must be an integer");
  if (record.redirect_uri !== undefined && typeof record.redirect_uri !== "string") throw new Error("Config redirect_uri must be a string");
  const redirect_uri = record.redirect_uri === undefined ? undefined : validateRedirectUri(record.redirect_uri);
  return { client_id: record.client_id, client_secret: record.client_secret, redirect_port: record.redirect_port ?? 8765, redirect_uri };
}

export async function readConfig(path: string): Promise<Config> {
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

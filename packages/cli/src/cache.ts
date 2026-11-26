import { chmod, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { OuraSleepDoc } from "@sleep-truth/core";

function filename(id: string): string {
  return `${createHash("sha256").update(id).digest("hex")}.json`;
}

/** Writes each document by id. The directory is the user's alone, so files from before this rule are covered too. */
export async function writeDocs(cacheDir: string, docs: OuraSleepDoc[]): Promise<number> {
  await mkdir(cacheDir, { recursive: true, mode: 0o700 });
  await chmod(cacheDir, 0o700);
  for (const doc of docs) {
    const path = join(cacheDir, filename(doc.id));
    await writeFile(path, JSON.stringify(doc, null, 2) + "\n", { mode: 0o600 });
    await chmod(path, 0o600);
  }
  return docs.length;
}

export type OnDamaged = (file: string, error: unknown) => void;

/** Every cached document. A file that is not JSON is passed to `onDamaged` and skipped. */
export async function readDocs(cacheDir: string, onDamaged: OnDamaged = () => {}): Promise<OuraSleepDoc[]> {
  let entries;
  try {
    entries = await readdir(cacheDir, { withFileTypes: true });
  } catch (error: unknown) {
    if (isMissing(error)) return [];
    throw error;
  }
  const docs: OuraSleepDoc[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const path = join(cacheDir, entry.name);
    try {
      docs.push(JSON.parse(await readFile(path, "utf8")) as OuraSleepDoc);
    } catch (error: unknown) {
      onDamaged(path, error);
    }
  }
  return docs;
}

function isMissing(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && (error as NodeJS.ErrnoException).code === "ENOENT";
}

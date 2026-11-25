import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { OuraSleepDoc } from "@sleep-truth/core";

function filename(id: string): string {
  return `${createHash("sha256").update(id).digest("hex")}.json`;
}

export async function writeDocs(cacheDir: string, docs: OuraSleepDoc[]): Promise<number> {
  await mkdir(cacheDir, { recursive: true });
  for (const doc of docs) await writeFile(join(cacheDir, filename(doc.id)), JSON.stringify(doc, null, 2) + "\n");
  return docs.length;
}

export async function readDocs(cacheDir: string): Promise<OuraSleepDoc[]> {
  try {
    const entries = await readdir(cacheDir, { withFileTypes: true });
    const docs = await Promise.all(entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map(async (entry) => JSON.parse(await readFile(join(cacheDir, entry.name), "utf8")) as OuraSleepDoc));
    return docs;
  } catch (error: unknown) {
    if (isMissing(error)) return [];
    throw error;
  }
}

function isMissing(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && (error as NodeJS.ErrnoException).code === "ENOENT";
}

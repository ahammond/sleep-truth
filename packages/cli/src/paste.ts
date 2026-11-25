import { createInterface } from "node:readline/promises";

/** Prompt for the redirected URL and read one line; Enter finishes it. */
export async function readPastedUrl(input: NodeJS.ReadableStream, output: NodeJS.WritableStream): Promise<URL> {
  const rl = createInterface({ input, output, terminal: false });
  try {
    const line = await rl.question("Paste the redirected URL, then press Enter: ");
    try {
      return new URL(line.trim());
    } catch {
      throw new Error("That is not a URL. Paste the whole address from the browser bar.");
    }
  } finally {
    rl.close();
  }
}

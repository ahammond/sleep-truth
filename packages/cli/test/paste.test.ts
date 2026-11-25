import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { readPastedUrl } from "../src/paste.ts";

describe("readPastedUrl", () => {
  it("resolves on the first line without waiting for end of input", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const pending = readPastedUrl(input, output);
    input.write("http://localhost:8765/callback?code=abc&state=xyz\n");
    // input is never ended
    const url = await pending;
    expect(url.searchParams.get("code")).toBe("abc");
    input.destroy();
  });

  it("rejects a line that is not a URL", async () => {
    const input = new PassThrough();
    const pending = readPastedUrl(input, new PassThrough());
    input.write("nope\n");
    await expect(pending).rejects.toThrow(/URL/);
  });
});

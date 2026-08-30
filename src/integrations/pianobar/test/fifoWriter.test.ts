import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeFifoKey } from "../src/fifoWriter.js";

describe("writeFifoKey", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "gomac-pianobar-fifo-"));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes exactly the given keystroke to an already-open reader", async () => {
    const fifoPath = join(dir, "ctl");
    execFileSync("mkfifo", [fifoPath]);

    // Open the read end non-blocking first so it's already present when
    // writeFifoKey's own non-blocking write-open runs -- avoids a race
    // against a blocking reader open that hasn't completed yet.
    const reader = await open(fifoPath, constants.O_RDONLY | constants.O_NONBLOCK);
    try {
      await writeFifoKey(fifoPath, "n");

      const buf = Buffer.alloc(1);
      const { bytesRead } = await reader.read(buf, 0, 1, null);
      expect(bytesRead).toBe(1);
      expect(buf.toString("utf8")).toBe("n");
    } finally {
      await reader.close();
    }
  });

  it("rejects instead of hanging when no reader has opened the fifo", async () => {
    const fifoPath = join(dir, "no-reader-ctl");
    execFileSync("mkfifo", [fifoPath]);

    await expect(writeFifoKey(fifoPath, "n")).rejects.toThrow();
  });
});

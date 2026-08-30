import { execFileSync } from "node:child_process";
import { constants, statSync, writeFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureFifo, writeFifoKey } from "../src/fifoWriter.js";

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

describe("ensureFifo", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "gomac-pianobar-ensurefifo-"));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates a fifo, including parent directories, when nothing exists yet", () => {
    const fifoPath = join(dir, "nested", "ctl");

    ensureFifo(fifoPath);

    expect(statSync(fifoPath).isFIFO()).toBe(true);
  });

  it("is a no-op when a fifo already exists at the path", () => {
    const fifoPath = join(dir, "already-there");
    execFileSync("mkfifo", [fifoPath]);

    expect(() => ensureFifo(fifoPath)).not.toThrow();
    expect(statSync(fifoPath).isFIFO()).toBe(true);
  });

  it("throws rather than silently replacing a non-fifo file at the path", () => {
    const notAFifo = join(dir, "regular-file");
    writeFileSync(notAFifo, "not a fifo");

    expect(() => ensureFifo(notAFifo)).toThrow(/non-FIFO/);
  });
});

import { describe, expect, it, vi } from "vitest";
import { handleCommand, parseCommandPayload } from "../src/commandHandler.js";
import type { Logger } from "../src/logger.js";

function fakeLogger(): Logger & { calls: { level: string; message: string }[] } {
  const calls: { level: string; message: string }[] = [];
  return {
    calls,
    info: (message) => calls.push({ level: "info", message }),
    warn: (message) => calls.push({ level: "warn", message }),
    error: (message) => calls.push({ level: "error", message }),
  };
}

describe("parseCommandPayload", () => {
  it("parses a valid JSON object payload", () => {
    expect(parseCommandPayload('{"action":"next"}')).toEqual({ action: "next" });
  });

  it("accepts Buffer input", () => {
    expect(parseCommandPayload(Buffer.from('{"action":"love"}'))).toEqual({ action: "love" });
  });

  it("rejects non-object JSON", () => {
    expect(() => parseCommandPayload("42")).toThrow();
    expect(() => parseCommandPayload("null")).toThrow();
    expect(() => parseCommandPayload("[1,2,3]")).toThrow();
  });

  it("rejects malformed JSON", () => {
    expect(() => parseCommandPayload("{not json")).toThrow();
  });
});

describe("handleCommand", () => {
  it("writes the correct keystroke to the fifo for a Tier 1 action", async () => {
    const logger = fakeLogger();
    const writeKey = vi.fn().mockResolvedValue(undefined);
    const processManager = { restart: vi.fn() };

    await handleCommand(
      { action: "next" },
      { fifoPath: "/tmp/ctl", processManager, logger, writeKey },
    );

    expect(writeKey).toHaveBeenCalledWith("/tmp/ctl", "n");
    expect(processManager.restart).not.toHaveBeenCalled();
  });

  it("maps resume and play to the same keystroke", async () => {
    const logger = fakeLogger();
    const writeKey = vi.fn().mockResolvedValue(undefined);
    const processManager = { restart: vi.fn() };

    await handleCommand({ action: "resume" }, { fifoPath: "/tmp/ctl", processManager, logger, writeKey });
    await handleCommand({ action: "play" }, { fifoPath: "/tmp/ctl", processManager, logger, writeKey });

    expect(writeKey).toHaveBeenNthCalledWith(1, "/tmp/ctl", "P");
    expect(writeKey).toHaveBeenNthCalledWith(2, "/tmp/ctl", "P");
  });

  it("calls processManager.restart() for the restart action instead of writing to the fifo", async () => {
    const logger = fakeLogger();
    const writeKey = vi.fn().mockResolvedValue(undefined);
    const processManager = { restart: vi.fn().mockResolvedValue(999) };

    await handleCommand({ action: "restart" }, { fifoPath: "/tmp/ctl", processManager, logger, writeKey });

    expect(processManager.restart).toHaveBeenCalledOnce();
    expect(writeKey).not.toHaveBeenCalled();
  });

  it("logs and ignores an unsupported action without writing to the fifo", async () => {
    const logger = fakeLogger();
    const writeKey = vi.fn().mockResolvedValue(undefined);
    const processManager = { restart: vi.fn() };

    await handleCommand({ action: "select_source" }, { fifoPath: "/tmp/ctl", processManager, logger, writeKey });

    expect(writeKey).not.toHaveBeenCalled();
    expect(logger.calls.some((c) => c.level === "warn")).toBe(true);
  });

  it("logs and ignores a payload with a missing action", async () => {
    const logger = fakeLogger();
    const writeKey = vi.fn().mockResolvedValue(undefined);
    const processManager = { restart: vi.fn() };

    await handleCommand({}, { fifoPath: "/tmp/ctl", processManager, logger, writeKey });

    expect(writeKey).not.toHaveBeenCalled();
    expect(processManager.restart).not.toHaveBeenCalled();
    expect(logger.calls.some((c) => c.level === "warn")).toBe(true);
  });

  it("logs an error rather than throwing when the fifo write fails", async () => {
    const logger = fakeLogger();
    const writeKey = vi.fn().mockRejectedValue(new Error("ENXIO: no reader"));
    const processManager = { restart: vi.fn() };

    await expect(
      handleCommand({ action: "love" }, { fifoPath: "/tmp/ctl", processManager, logger, writeKey }),
    ).resolves.toBeUndefined();

    expect(logger.calls.some((c) => c.level === "error")).toBe(true);
  });
});

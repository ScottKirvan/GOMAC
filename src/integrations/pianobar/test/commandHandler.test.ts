import { describe, expect, it, vi } from "vitest";
import { findStationIndex, handleCommand, parseCommandPayload } from "../src/commandHandler.js";
import { createStationDirectory } from "../src/stationDirectory.js";
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

function baseDeps(overrides: Partial<Parameters<typeof handleCommand>[1]> = {}) {
  return {
    fifoPath: "/tmp/ctl",
    processManager: { restart: vi.fn() },
    stationDirectory: createStationDirectory(),
    systemVolume: { getVolume: vi.fn().mockResolvedValue(0.5), setVolume: vi.fn().mockResolvedValue(undefined) },
    publishState: vi.fn(),
    logger: fakeLogger(),
    writeKey: vi.fn().mockResolvedValue(undefined),
    ...overrides,
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

describe("findStationIndex", () => {
  it("finds a case-insensitive exact match", () => {
    expect(findStationIndex(["Alpha", "Bravo"], "bravo")).toBe(1);
    expect(findStationIndex(["Alpha", "Bravo"], "ALPHA")).toBe(0);
  });

  it("trims surrounding whitespace before matching", () => {
    expect(findStationIndex(["Alpha", "Bravo"], "  Bravo  ")).toBe(1);
  });

  it("returns undefined when there is no match", () => {
    expect(findStationIndex(["Alpha", "Bravo"], "Charlie")).toBeUndefined();
  });

  it("returns undefined when there is no known station list yet", () => {
    expect(findStationIndex(undefined, "Alpha")).toBeUndefined();
  });
});

describe("handleCommand", () => {
  it("writes the correct keystroke to the fifo for a Tier 1 action", async () => {
    const deps = baseDeps();

    await handleCommand({ action: "next" }, deps);

    expect(deps.writeKey).toHaveBeenCalledWith("/tmp/ctl", "n");
    expect(deps.processManager.restart).not.toHaveBeenCalled();
  });

  it("maps resume and play to the same keystroke", async () => {
    const deps = baseDeps();

    await handleCommand({ action: "resume" }, deps);
    await handleCommand({ action: "play" }, deps);

    expect(deps.writeKey).toHaveBeenNthCalledWith(1, "/tmp/ctl", "P");
    expect(deps.writeKey).toHaveBeenNthCalledWith(2, "/tmp/ctl", "P");
  });

  it("calls processManager.restart() for the restart action instead of writing to the fifo", async () => {
    const deps = baseDeps({ processManager: { restart: vi.fn().mockResolvedValue(999) } });

    await handleCommand({ action: "restart" }, deps);

    expect(deps.processManager.restart).toHaveBeenCalledOnce();
    expect(deps.writeKey).not.toHaveBeenCalled();
  });

  it("logs and ignores an unsupported action without writing to the fifo", async () => {
    const deps = baseDeps();

    await handleCommand({ action: "quickmix_toggle" }, deps);

    expect(deps.writeKey).not.toHaveBeenCalled();
    expect(deps.logger.calls.some((c) => c.level === "warn")).toBe(true);
  });

  it("logs and ignores a payload with a missing action", async () => {
    const deps = baseDeps();

    await handleCommand({}, deps);

    expect(deps.writeKey).not.toHaveBeenCalled();
    expect(deps.processManager.restart).not.toHaveBeenCalled();
    expect(deps.logger.calls.some((c) => c.level === "warn")).toBe(true);
  });

  it("logs an error rather than throwing when the fifo write fails", async () => {
    const deps = baseDeps({ writeKey: vi.fn().mockRejectedValue(new Error("ENXIO: no reader")) });

    await expect(handleCommand({ action: "love" }, deps)).resolves.toBeUndefined();

    expect(deps.logger.calls.some((c) => c.level === "error")).toBe(true);
  });

  describe("select_source", () => {
    it("writes 's<index>\\n' as a single fifo write when the station is known", async () => {
      const stationDirectory = createStationDirectory();
      stationDirectory.setStations(["Alpha", "Bravo", "Charlie"]);
      const deps = baseDeps({ stationDirectory });

      await handleCommand({ action: "select_source", station: "Bravo" }, deps);

      expect(deps.writeKey).toHaveBeenCalledWith("/tmp/ctl", "s1\n");
      expect(deps.writeKey).toHaveBeenCalledTimes(1);
    });

    it("matches station names case-insensitively", async () => {
      const stationDirectory = createStationDirectory();
      stationDirectory.setStations(["Alpha", "Bravo"]);
      const deps = baseDeps({ stationDirectory });

      await handleCommand({ action: "select_source", station: "ALPHA" }, deps);

      expect(deps.writeKey).toHaveBeenCalledWith("/tmp/ctl", "s0\n");
    });

    it("warns and writes nothing when no station list has been received yet", async () => {
      const deps = baseDeps();

      await handleCommand({ action: "select_source", station: "Alpha" }, deps);

      expect(deps.writeKey).not.toHaveBeenCalled();
      expect(deps.logger.calls.some((c) => c.level === "warn" && c.message.includes("no station list"))).toBe(true);
    });

    it("warns and writes nothing when the named station isn't in the known list", async () => {
      const stationDirectory = createStationDirectory();
      stationDirectory.setStations(["Alpha", "Bravo"]);
      const deps = baseDeps({ stationDirectory });

      await handleCommand({ action: "select_source", station: "Charlie" }, deps);

      expect(deps.writeKey).not.toHaveBeenCalled();
      expect(deps.logger.calls.some((c) => c.level === "warn")).toBe(true);
    });

    it("warns and writes nothing when the station field is missing or not a string", async () => {
      const stationDirectory = createStationDirectory();
      stationDirectory.setStations(["Alpha"]);
      const deps = baseDeps({ stationDirectory });

      await handleCommand({ action: "select_source" }, deps);

      expect(deps.writeKey).not.toHaveBeenCalled();
      expect(deps.logger.calls.some((c) => c.level === "warn")).toBe(true);
    });
  });

  describe("volume_set", () => {
    it("sets the system volume and publishes whatever wpctl actually reports back", async () => {
      const systemVolume = { getVolume: vi.fn().mockResolvedValue(0.73), setVolume: vi.fn().mockResolvedValue(undefined) };
      const deps = baseDeps({ systemVolume });

      await handleCommand({ action: "volume_set", volume: 0.7 }, deps);

      expect(systemVolume.setVolume).toHaveBeenCalledWith(0.7);
      expect(deps.publishState).toHaveBeenCalledWith("volume", "0.73");
      expect(deps.writeKey).not.toHaveBeenCalled();
    });

    it("falls back to the clamped requested value if reading it back fails", async () => {
      const systemVolume = { getVolume: vi.fn().mockResolvedValue(undefined), setVolume: vi.fn().mockResolvedValue(undefined) };
      const deps = baseDeps({ systemVolume });

      await handleCommand({ action: "volume_set", volume: 1.5 }, deps);

      expect(deps.publishState).toHaveBeenCalledWith("volume", "1.00");
    });

    it("warns and does not call setVolume when the volume field is missing or not a number", async () => {
      const deps = baseDeps();

      await handleCommand({ action: "volume_set" }, deps);

      expect(deps.systemVolume.setVolume).not.toHaveBeenCalled();
      expect(deps.logger.calls.some((c) => c.level === "warn")).toBe(true);
    });

    it("logs an error rather than throwing when setVolume rejects", async () => {
      const systemVolume = { getVolume: vi.fn().mockResolvedValue(0.5), setVolume: vi.fn().mockRejectedValue(new Error("wpctl not found")) };
      const deps = baseDeps({ systemVolume });

      await expect(handleCommand({ action: "volume_set", volume: 0.5 }, deps)).resolves.toBeUndefined();

      expect(deps.logger.calls.some((c) => c.level === "error")).toBe(true);
      expect(deps.publishState).not.toHaveBeenCalled();
    });
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import { createConnection, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "../src/logger.js";
import { createStationDirectory } from "../src/stationDirectory.js";
import { startTelemetryServer, type TelemetryMqttClient } from "../src/telemetryServer.js";

function fakeLogger(): Logger & { calls: { level: string; message: string }[] } {
  const calls: { level: string; message: string }[] = [];
  return {
    calls,
    info: (message) => calls.push({ level: "info", message }),
    warn: (message) => calls.push({ level: "warn", message }),
    error: (message) => calls.push({ level: "error", message }),
  };
}

function sendRaw(socketPath: string, line: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    socket.on("connect", () => socket.write(`${line}\n`));
    socket.on("data", () => {
      socket.end();
    });
    socket.on("close", () => resolve());
    socket.on("error", reject);
  });
}

describe("startTelemetryServer", () => {
  let dir: string;
  let server: Server | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gomac-pianobar-telemetry-server-"));
  });

  afterEach(async () => {
    if (server !== undefined) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it("publishes retained state topics for a known telemetry event", async () => {
    const socketPath = join(dir, "eventcmd.sock");
    const publish = vi.fn();
    const mqttClient: TelemetryMqttClient = { publish };
    const stationDirectory = createStationDirectory();
    const logger = fakeLogger();

    server = startTelemetryServer(socketPath, mqttClient, stationDirectory, logger);
    await new Promise<void>((resolve) => server?.once("listening", resolve));

    await sendRaw(
      socketPath,
      JSON.stringify({
        event: "songstart",
        data: { title: "Foo", artist: "Bar", album: "Baz", stationName: "My Station", stationCount: "0" },
      }),
    );

    expect(publish).toHaveBeenCalledWith(
      "gomac/pandora/state/title",
      "Foo",
      { qos: 1, retain: true },
      expect.any(Function),
    );
    expect(publish).toHaveBeenCalledWith(
      "gomac/pandora/state/station",
      "My Station",
      { qos: 1, retain: true },
      expect.any(Function),
    );
  });

  it("updates the station directory when a message carries a station list", async () => {
    const socketPath = join(dir, "eventcmd.sock");
    const mqttClient: TelemetryMqttClient = { publish: vi.fn() };
    const stationDirectory = createStationDirectory();
    const logger = fakeLogger();

    server = startTelemetryServer(socketPath, mqttClient, stationDirectory, logger);
    await new Promise<void>((resolve) => server?.once("listening", resolve));

    await sendRaw(
      socketPath,
      JSON.stringify({
        event: "usergetstations",
        data: { stationCount: "2", station0: "Alpha", station1: "Bravo" },
      }),
    );

    expect(stationDirectory.getStations()).toEqual(["Alpha", "Bravo"]);
  });

  it("logs a warning and does not publish anything for malformed JSON", async () => {
    const socketPath = join(dir, "eventcmd.sock");
    const publish = vi.fn();
    const mqttClient: TelemetryMqttClient = { publish };
    const stationDirectory = createStationDirectory();
    const logger = fakeLogger();

    server = startTelemetryServer(socketPath, mqttClient, stationDirectory, logger);
    await new Promise<void>((resolve) => server?.once("listening", resolve));

    await sendRaw(socketPath, "not json");

    expect(publish).not.toHaveBeenCalled();
    expect(logger.calls.some((c) => c.level === "warn")).toBe(true);
  });

  it("ignores events outside this phase's telemetry scope without publishing", async () => {
    const socketPath = join(dir, "eventcmd.sock");
    const publish = vi.fn();
    const mqttClient: TelemetryMqttClient = { publish };
    const stationDirectory = createStationDirectory();
    const logger = fakeLogger();

    server = startTelemetryServer(socketPath, mqttClient, stationDirectory, logger);
    await new Promise<void>((resolve) => server?.once("listening", resolve));

    await sendRaw(socketPath, JSON.stringify({ event: "stationdelete", data: { stationCount: "0" } }));

    expect(publish).not.toHaveBeenCalled();
  });

  it("removes a stale socket file left behind by a previous run before listening", async () => {
    const socketPath = join(dir, "eventcmd.sock");
    const stale = startTelemetryServer(socketPath, { publish: vi.fn() }, createStationDirectory(), fakeLogger());
    await new Promise<void>((resolve) => stale.once("listening", resolve));
    await new Promise<void>((resolve) => stale.close(() => resolve()));

    server = startTelemetryServer(socketPath, { publish: vi.fn() }, createStationDirectory(), fakeLogger());
    await new Promise<void>((resolve, reject) => {
      server?.once("listening", resolve);
      server?.once("error", reject);
    });
  });
});

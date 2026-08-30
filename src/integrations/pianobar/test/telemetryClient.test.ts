import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sendTelemetryEvent } from "../src/telemetryClient.js";

describe("sendTelemetryEvent", () => {
  let dir: string;
  let server: Server | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gomac-pianobar-telemetry-client-"));
  });

  afterEach(async () => {
    rmSync(dir, { recursive: true, force: true });
    if (server !== undefined) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
    }
  });

  it("sends the event name and data as a single JSON line and resolves once acknowledged", async () => {
    const socketPath = join(dir, "eventcmd.sock");
    const received: string[] = [];

    server = createServer((socket) => {
      let buffer = "";
      socket.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        if (buffer.includes("\n")) {
          received.push(buffer);
          socket.end("ok\n");
        }
      });
    });
    await new Promise<void>((resolve) => server?.listen(socketPath, resolve));

    await sendTelemetryEvent(socketPath, "songstart", { title: "Foo", artist: "Bar" });

    expect(received).toHaveLength(1);
    expect(JSON.parse(received[0]!)).toEqual({ event: "songstart", data: { title: "Foo", artist: "Bar" } });
  });

  it("resolves without throwing when nothing is listening on the socket", async () => {
    const socketPath = join(dir, "no-listener.sock");
    await expect(sendTelemetryEvent(socketPath, "songstart", {}, { timeoutMs: 500 })).resolves.toBeUndefined();
  });

  it("resolves within the configured timeout when the server never responds", async () => {
    const socketPath = join(dir, "silent.sock");
    const acceptedSockets: Socket[] = [];
    server = createServer((socket) => {
      acceptedSockets.push(socket);
      /* accept the connection but never reply */
    });
    await new Promise<void>((resolve) => server?.listen(socketPath, resolve));

    const start = Date.now();
    await sendTelemetryEvent(socketPath, "songstart", {}, { timeoutMs: 200 });
    expect(Date.now() - start).toBeLessThan(2000);

    for (const socket of acceptedSockets) {
      socket.destroy();
    }
  });
});

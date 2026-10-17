import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { buildLiveUpdate, createLiveStream } from "../src/liveStream.js";
import type { Logger } from "../src/logger.js";
import { coarsenPosition } from "../src/positionState.js";
import { startServer, type DashboardServer } from "../src/server.js";
import type { DashboardSnapshot } from "../src/types.js";

const silentLogger: Logger = { info() {}, warn() {}, error() {} };
const position = { latitude: 44.3712, longitude: -64.3268, speedMps: 5.38, courseDeg: 271.6 };
const emptySnapshot = {} as DashboardSnapshot;

async function firstLiveEvent(port: number): Promise<{ contentType: string | null; data: unknown }> {
  const controller = new AbortController();
  const res = await fetch(`http://127.0.0.1:${port}/stream`, { signal: controller.signal });
  const reader = res.body!.getReader();
  let text = "";
  while (!text.includes("event: live\ndata: ") || !text.slice(text.indexOf("event: live")).includes("\n\n")) {
    const { value } = await reader.read();
    text += new TextDecoder().decode(value);
  }
  controller.abort();
  const block = text.slice(text.indexOf("event: live"));
  const data = JSON.parse(block.slice(block.indexOf("data: ") + 6, block.indexOf("\n\n")));
  return { contentType: res.headers.get("content-type"), data };
}

describe("startServer /stream", () => {
  let server: DashboardServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("streams full position on the private port and coarse position on the public port", async () => {
    const config = loadConfig({ HTTP_PORT: "0", HTTP_PRIVATE_PORT: "0" });
    const options = { ...config.liveStream, logger: silentLogger };
    server = startServer(
      config,
      silentLogger,
      () => emptySnapshot,
      () => emptySnapshot,
      createLiveStream({ ...options, getUpdate: () => buildLiveUpdate({ current: 2.5 }, position) }),
      createLiveStream({ ...options, getUpdate: () => buildLiveUpdate({ current: 2.5 }, coarsenPosition(position)) }),
    );
    await Promise.all([
      new Promise((r) => server!.httpServer.once("listening", r)),
      new Promise((r) => server!.privateServer.once("listening", r)),
    ]);

    const priv = await firstLiveEvent((server.privateServer.address() as AddressInfo).port);
    expect(priv.contentType).toBe("text/event-stream");
    expect(priv.data).toMatchObject({ v: 1, power: { current: 2.5 }, position: { latitude: 44.3712, courseDeg: 271.6 } });

    const pub = await firstLiveEvent((server.httpServer.address() as AddressInfo).port);
    expect(pub.data).toMatchObject({ position: { latitude: 44.4, longitude: -64.3, speedMps: 5, courseDeg: 272, coarse: true } });
  });
});

import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildLiveUpdate, createLiveStream, type LiveUpdate } from "../src/liveStream.js";
import type { Logger } from "../src/logger.js";

const silentLogger: Logger = { info() {}, warn() {}, error() {} };

class FakeResponse {
  status?: number;
  headers: Record<string, string | number> = {};
  chunks: string[] = [];
  ended = false;
  writeHead(status: number, headers: Record<string, string | number>) {
    this.status = status;
    this.headers = headers;
    return this;
  }
  write(chunk: string) {
    this.chunks.push(chunk);
    return true;
  }
  end(chunk?: string) {
    if (chunk) this.chunks.push(chunk);
    this.ended = true;
  }
  events(): LiveUpdate[] {
    return this.chunks
      .filter((c) => c.startsWith("event: live\n"))
      .map((c) => JSON.parse(c.slice(c.indexOf("data: ") + 6)) as LiveUpdate);
  }
}

function connect(stream: ReturnType<typeof createLiveStream>) {
  const req = new EventEmitter() as unknown as IncomingMessage;
  const res = new FakeResponse();
  stream.handle(req, res as unknown as ServerResponse);
  return { req: req as unknown as EventEmitter, res };
}

describe("buildLiveUpdate", () => {
  it("carries the live power and position fields under a versioned envelope", () => {
    const update = buildLiveUpdate(
      { current: 4.3, solarPower: 59, voltage: 13.29, soc: 68 },
      { latitude: 44.37, longitude: -64.32, speedMps: 5.4, courseDeg: 271, accuracyM: 8 },
    );
    expect(update).toEqual({
      v: 1,
      power: { current: 4.3, solarPower: 59, voltage: 13.29 },
      position: { latitude: 44.37, longitude: -64.32, speedMps: 5.4, courseDeg: 271 },
    });
  });

  it("passes the coarse marker through for the public variant", () => {
    const update = buildLiveUpdate({}, { latitude: 44.4, longitude: -64.3, coarse: true });
    expect(update.position.coarse).toBe(true);
  });
});

describe("createLiveStream", () => {
  let value: LiveUpdate;
  const getUpdate = () => value;

  beforeEach(() => {
    vi.useFakeTimers();
    value = buildLiveUpdate({ current: 1 }, {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens an SSE response with CORS and sends the current values right away", () => {
    const stream = createLiveStream({ getUpdate, rateHz: 4, maxClients: 5, keepAliveMs: 15_000, logger: silentLogger });
    const { res } = connect(stream);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("text/event-stream");
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.events()).toEqual([{ ...value, t: expect.any(Number) }]);
    stream.close();
  });

  it("sends at most rateHz updates a second, each with the latest values", async () => {
    const stream = createLiveStream({ getUpdate, rateHz: 4, maxClients: 5, keepAliveMs: 15_000, logger: silentLogger });
    const { res } = connect(stream);
    for (let i = 2; i <= 40; i++) {
      value = buildLiveUpdate({ current: i }, {});
      await vi.advanceTimersByTimeAsync(25);
    }
    await vi.advanceTimersByTimeAsync(250);
    // ~1.2s of changes every 25ms: the initial event plus at most one per 250ms sample.
    const events = res.events();
    expect(events.length).toBeLessThanOrEqual(6);
    expect(events.at(-1)!.power.current).toBe(40);
    stream.close();
  });

  it("stamps each event with the server time it was sent", async () => {
    vi.setSystemTime(1_700_000_000_000);
    const stream = createLiveStream({ getUpdate, rateHz: 4, maxClients: 5, keepAliveMs: 15_000, logger: silentLogger });
    const { res } = connect(stream);
    value = buildLiveUpdate({ current: 2 }, {});
    await vi.advanceTimersByTimeAsync(250);
    const [first, second] = res.events();
    expect(first!.t).toBe(1_700_000_000_000);
    expect(second!.t).toBe(1_700_000_000_250);
    stream.close();
  });

  it("sends nothing when the values haven't changed", async () => {
    const stream = createLiveStream({ getUpdate, rateHz: 4, maxClients: 5, keepAliveMs: 15_000, logger: silentLogger });
    const { res } = connect(stream);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(res.events()).toHaveLength(1);
    stream.close();
  });

  it("sends keep-alive comments so idle proxies don't drop the connection", async () => {
    const stream = createLiveStream({ getUpdate, rateHz: 4, maxClients: 5, keepAliveMs: 15_000, logger: silentLogger });
    const { res } = connect(stream);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(res.chunks.filter((c) => c.startsWith(":"))).toHaveLength(2);
    stream.close();
  });

  it("refuses connections past the cap so those viewers fall back to polling", () => {
    const stream = createLiveStream({ getUpdate, rateHz: 4, maxClients: 2, keepAliveMs: 15_000, logger: silentLogger });
    connect(stream);
    connect(stream);
    const { res } = connect(stream);
    expect(res.status).toBe(503);
    expect(res.ended).toBe(true);
    expect(stream.clientCount()).toBe(2);
    stream.close();
  });

  it("drops a client when it disconnects and stops its timers once nobody is connected", async () => {
    const stream = createLiveStream({ getUpdate, rateHz: 4, maxClients: 5, keepAliveMs: 15_000, logger: silentLogger });
    const { req } = connect(stream);
    expect(stream.clientCount()).toBe(1);
    req.emit("close");
    expect(stream.clientCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    stream.close();
  });

  it("ends every open stream on close", () => {
    const stream = createLiveStream({ getUpdate, rateHz: 4, maxClients: 5, keepAliveMs: 15_000, logger: silentLogger });
    const a = connect(stream);
    const b = connect(stream);
    stream.close();
    expect(a.res.ended && b.res.ended).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

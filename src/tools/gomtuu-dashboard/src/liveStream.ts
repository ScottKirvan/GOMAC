import type { IncomingMessage, ServerResponse } from "node:http";
import type { Logger } from "./logger.js";
import type { PositionState, PowerSummary } from "./types.js";

/**
 * Payload of each `live` Server-Sent Event on `/stream`. `v` is bumped on
 * any incompatible change; consumers should ignore fields they don't know.
 */
export interface LiveUpdate {
  v: 1;
  /** Server time the event was sent (ms since epoch). Added on send; not part of change detection. */
  t?: number;
  power: Pick<PowerSummary, "current" | "solarPower" | "voltage">;
  position: Pick<PositionState, "latitude" | "longitude" | "speedMps" | "courseDeg" | "coarse">;
}

export function buildLiveUpdate(power: PowerSummary, position: PositionState): LiveUpdate {
  return {
    v: 1,
    power: { current: power.current, solarPower: power.solarPower, voltage: power.voltage },
    position: {
      latitude: position.latitude,
      longitude: position.longitude,
      speedMps: position.speedMps,
      courseDeg: position.courseDeg,
      coarse: position.coarse,
    },
  };
}

export interface LiveStreamOptions {
  getUpdate: () => LiveUpdate;
  rateHz: number;
  maxClients: number;
  keepAliveMs: number;
  logger: Logger;
}

export interface LiveStream {
  handle(req: IncomingMessage, res: ServerResponse): void;
  clientCount(): number;
  close(): void;
}

/**
 * One-way push of the fast-changing readings. Values are sampled from the
 * stores at most `rateHz` times a second and sent only when they changed,
 * so a burst of MQTT messages never queues a backlog of stale values. Its
 * timers run only while at least one client is connected.
 */
export function createLiveStream({ getUpdate, rateHz, maxClients, keepAliveMs, logger }: LiveStreamOptions): LiveStream {
  const clients = new Set<ServerResponse>();
  let lastJson: string | undefined;
  let sampleTimer: ReturnType<typeof setInterval> | undefined;
  let keepAliveTimer: ReturnType<typeof setInterval> | undefined;

  // `json` is the update without its timestamp; the timestamp is spliced in
  // at send time so it never makes an unchanged update look changed.
  const send = (res: ServerResponse, json: string): void => {
    res.write(`event: live\ndata: {"t":${Date.now()},${json.slice(1)}\n\n`);
  };

  const sample = (): void => {
    const json = JSON.stringify(getUpdate());
    if (json === lastJson) return;
    lastJson = json;
    for (const res of clients) send(res, json);
  };

  const startTimers = (): void => {
    sampleTimer = setInterval(sample, 1000 / rateHz);
    keepAliveTimer = setInterval(() => {
      for (const res of clients) res.write(": keepalive\n\n");
    }, keepAliveMs);
  };

  const stopTimers = (): void => {
    clearInterval(sampleTimer);
    clearInterval(keepAliveTimer);
    sampleTimer = undefined;
    keepAliveTimer = undefined;
  };

  return {
    handle(req, res) {
      if (clients.size >= maxClients) {
        res.writeHead(503, { "content-type": "text/plain", "access-control-allow-origin": "*", "retry-after": "60" });
        res.end("too many live stream clients; use /snapshot.json");
        logger.warn(`live stream at capacity (${maxClients}); refused a client`);
        return;
      }
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
        connection: "keep-alive",
        "access-control-allow-origin": "*",
        // Asks any buffering proxy in the path to pass events through as they're written.
        "x-accel-buffering": "no",
      });
      res.write("retry: 5000\n\n");
      lastJson = JSON.stringify(getUpdate());
      send(res, lastJson);
      clients.add(res);
      if (clients.size === 1) startTimers();
      req.on("close", () => {
        clients.delete(res);
        if (clients.size === 0) stopTimers();
      });
    },
    clientCount: () => clients.size,
    close() {
      stopTimers();
      for (const res of clients) res.end();
      clients.clear();
    },
  };
}

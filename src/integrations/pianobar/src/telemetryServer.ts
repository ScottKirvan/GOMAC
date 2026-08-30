import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { dirname } from "node:path";
import { buildStateMessages, isTelemetryEvent, parseStationList } from "./telemetry.js";
import type { Logger } from "./logger.js";
import type { StationDirectory } from "./stationDirectory.js";

export interface TelemetryMqttClient {
  publish(
    topic: string,
    payload: string,
    opts: { qos: 0 | 1 | 2; retain: boolean },
    callback?: (err?: Error) => void,
  ): unknown;
}

/**
 * pianobar's own `event_command` mechanism forks a brand-new process per
 * event (see pandora-mqtt-spec.md's Telemetry Surface section) -- it is
 * never the long-running daemon. Rather than have each of those
 * short-lived processes open its own MQTT connection (which would need a
 * distinct client ID to avoid the broker evicting the daemon's own
 * long-lived connection on a client-ID collision, per MQTT's normal
 * takeover behavior), each invocation hands its event off to the daemon
 * over a local Unix domain socket, and the daemon -- which already holds
 * the single authenticated MQTT connection for this identity -- does the
 * actual publish. This also means every telemetry publish genuinely goes
 * out over "this daemon's existing configured MQTT identity", not a
 * second one, in the most literal sense: the same connection, not just the
 * same credentials reused on a second one.
 *
 * A second reason this beat a per-invocation MQTT connection: pianobar
 * forks its `event_command` process and then blocks on `waitpid` for it to
 * exit before continuing (confirmed in pianobar 2024.12.21's own
 * `BarUiStartEventCmd`) -- for `songstart` specifically, that wait happens
 * *before* the player thread is started, so a slow event_command directly
 * delays audio starting. A local socket round-trip is far cheaper than an
 * MQTT CONNECT/CONNACK handshake on every single event.
 */
export function startTelemetryServer(
  socketPath: string,
  mqttClient: TelemetryMqttClient,
  stationDirectory: StationDirectory,
  logger: Logger,
): Server {
  mkdirSync(dirname(socketPath), { recursive: true });
  if (existsSync(socketPath)) {
    unlinkSync(socketPath);
  }

  const server = createServer((socket) => {
    handleConnection(socket, mqttClient, stationDirectory, logger);
  });

  server.on("error", (err) => {
    logger.error(`telemetry socket server error: ${err.message}`);
  });

  server.listen(socketPath);
  return server;
}

function handleConnection(
  socket: Socket,
  mqttClient: TelemetryMqttClient,
  stationDirectory: StationDirectory,
  logger: Logger,
): void {
  let buffer = "";
  let responded = false;

  socket.on("data", (chunk: Buffer) => {
    if (responded) {
      return;
    }
    buffer += chunk.toString("utf8");
    const newlineIndex = buffer.indexOf("\n");
    if (newlineIndex === -1) {
      return;
    }
    responded = true;
    const line = buffer.slice(0, newlineIndex);
    socket.end("ok\n");
    processTelemetryLine(line, mqttClient, stationDirectory, logger);
  });

  socket.on("error", (err: NodeJS.ErrnoException) => {
    /* The runner (telemetryClient.ts) destroys its socket the instant it
     * sees the "ok\n" ack, which can race this end's own `end()` write
     * completing -- a harmless EPIPE/ECONNRESET after we've already
     * responded, not a real delivery failure. */
    if (responded && (err.code === "EPIPE" || err.code === "ECONNRESET")) {
      return;
    }
    logger.warn(`telemetry socket connection error: ${err.message}`);
  });
}

function processTelemetryLine(
  line: string,
  mqttClient: TelemetryMqttClient,
  stationDirectory: StationDirectory,
  logger: Logger,
): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (err) {
    logger.warn(`ignoring malformed telemetry message: ${(err as Error).message}`);
    return;
  }

  if (typeof parsed !== "object" || parsed === null) {
    logger.warn("ignoring malformed telemetry message: not a JSON object");
    return;
  }

  const { event, data } = parsed as { event?: unknown; data?: unknown };
  if (typeof event !== "string" || typeof data !== "object" || data === null || Array.isArray(data)) {
    logger.warn('ignoring malformed telemetry message: missing "event"/"data"');
    return;
  }

  if (!isTelemetryEvent(event)) {
    logger.warn(`ignoring telemetry for out-of-scope event "${event}"`);
    return;
  }

  const fields = data as Record<string, string>;

  const stations = parseStationList(fields);
  if (stations !== undefined) {
    stationDirectory.setStations(stations);
  }

  const messages = buildStateMessages(event, fields);
  for (const message of messages) {
    mqttClient.publish(message.topic, message.payload, { qos: 1, retain: true }, (err) => {
      if (err) {
        logger.error(`failed to publish ${message.topic}: ${err.message}`);
      }
    });
  }
  logger.info(`published ${messages.length} telemetry topic(s) for "${event}"`);
}

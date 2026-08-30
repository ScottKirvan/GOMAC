import { createConnection } from "node:net";

const DEFAULT_TIMEOUT_MS = 3000;

/**
 * Fire-and-forget by design: never throws, always resolves. pianobar
 * blocks (`waitpid`) on this whole process exiting before it continues its
 * own event loop (see telemetryServer.ts's doc comment), so this must
 * never hang -- a missing/unresponsive daemon socket (e.g. mid-restart)
 * just means this event's telemetry is silently dropped, bounded by
 * `timeoutMs`, rather than stalling pianobar.
 */
export function sendTelemetryEvent(
  socketPath: string,
  event: string,
  data: Record<string, string>,
  options: { timeoutMs?: number } = {},
): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve();
    };

    const timer = setTimeout(finish, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    const socket = createConnection(socketPath);
    socket.on("connect", () => {
      socket.write(`${JSON.stringify({ event, data })}\n`);
    });
    socket.on("data", finish);
    socket.on("error", finish);
    socket.on("close", finish);
  });
}

import { readFileSync } from "node:fs";
import { loadConfig } from "./config.js";
import { parseEventCommandStdin } from "./telemetry.js";
import { sendTelemetryEvent } from "./telemetryClient.js";

/**
 * The actual process pianobar execs per event (via the wrapper script
 * eventCommand.ts generates). This is a fresh, short-lived process every
 * time -- not the daemon -- so it stays as thin as possible: parse argv/
 * stdin, hand off to the daemon over the local socket, exit. See
 * telemetryServer.ts for why this hands off rather than publishing to MQTT
 * directly. Not unit tested directly, same as index.ts -- the logic worth
 * testing (stdin parsing, the socket protocol) lives in telemetry.ts /
 * telemetryClient.ts, which are.
 */
async function main(): Promise<void> {
  const event = process.argv[2];
  if (!event) {
    process.exit(0);
  }

  let stdinRaw = "";
  try {
    stdinRaw = readFileSync(0, "utf8");
  } catch {
    stdinRaw = "";
  }

  const config = loadConfig();
  await sendTelemetryEvent(config.pianobar.eventSocketPath, event, parseEventCommandStdin(stdinRaw));
  process.exit(0);
}

void main();

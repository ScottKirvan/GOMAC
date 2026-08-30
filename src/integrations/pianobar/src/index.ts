import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { ensureEventCommandScript } from "./eventCommand.js";
import { ensureFifo } from "./fifoWriter.js";
import { consoleLogger as logger } from "./logger.js";
import { connectMqtt } from "./mqttClient.js";
import { ensurePianobarConfig } from "./pianobarConfig.js";
import { PianobarProcessManager } from "./processManager.js";
import { createStationDirectory } from "./stationDirectory.js";
import { startTelemetryServer } from "./telemetryServer.js";

/**
 * eventCommandRunner has a sibling `.ts` (dev, run via tsx) and `.js`
 * (built, run via plain node) form -- see eventCommand.ts's
 * renderEventCommandScript. Deriving the path from this module's own
 * `import.meta.url`/extension, rather than hardcoding one, guarantees the
 * generated event_command script always matches whichever mode this very
 * process is running under.
 */
function resolveEventCommandRunnerPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  return join(dirname(currentFile), `eventCommandRunner${extname(currentFile)}`);
}

function main(): void {
  const config = loadConfig();
  const runnerPath = resolveEventCommandRunnerPath();

  ensureEventCommandScript(config.pianobar.eventCommandPath, runnerPath);
  ensureFifo(config.pianobar.fifoPath);
  ensurePianobarConfig(config.pianobar.configPath, {
    fifo: config.pianobar.fifoPath,
    eventCommand: config.pianobar.eventCommandPath,
    autostartStationId: config.pianobar.autostartStationId,
  });

  const processManager = new PianobarProcessManager(config);
  const pid = processManager.adoptOrSpawn();
  logger.info(`pianobar running as pid ${pid}`);

  const stationDirectory = createStationDirectory();
  const client = connectMqtt(config, processManager, stationDirectory, logger);
  const telemetryServer = startTelemetryServer(config.pianobar.eventSocketPath, client, stationDirectory, logger);

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info(`received ${signal}, shutting down daemon (pianobar keeps running detached)`);
    telemetryServer.close();
    client.end(true, {}, () => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();

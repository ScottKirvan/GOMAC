import { loadConfig } from "./config.js";
import { ensureEventCommandScript } from "./eventCommand.js";
import { ensureFifo } from "./fifoWriter.js";
import { consoleLogger as logger } from "./logger.js";
import { connectMqtt } from "./mqttClient.js";
import { ensurePianobarConfig } from "./pianobarConfig.js";
import { PianobarProcessManager } from "./processManager.js";

function main(): void {
  const config = loadConfig();

  ensureEventCommandScript(config.pianobar.eventCommandPath);
  ensureFifo(config.pianobar.fifoPath);
  ensurePianobarConfig(config.pianobar.configPath, {
    fifo: config.pianobar.fifoPath,
    eventCommand: config.pianobar.eventCommandPath,
  });

  const processManager = new PianobarProcessManager(config);
  const pid = processManager.adoptOrSpawn();
  logger.info(`pianobar running as pid ${pid}`);

  const client = connectMqtt(config, processManager, logger);

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info(`received ${signal}, shutting down daemon (pianobar keeps running detached)`);
    client.end(true, {}, () => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();

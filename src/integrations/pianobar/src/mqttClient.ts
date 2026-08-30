import mqtt, { type MqttClient } from "mqtt";
import { handleCommand, parseCommandPayload } from "./commandHandler.js";
import type { DaemonConfig } from "./config.js";
import type { Logger } from "./logger.js";
import type { PianobarProcessManager } from "./processManager.js";
import type { StationDirectory } from "./stationDirectory.js";

export function connectMqtt(
  config: DaemonConfig,
  processManager: PianobarProcessManager,
  stationDirectory: StationDirectory,
  logger: Logger,
): MqttClient {
  const client = mqtt.connect({
    host: config.mqtt.host,
    port: config.mqtt.port,
    username: config.mqtt.username,
    password: config.mqtt.password,
    clientId: config.mqtt.clientId,
    will: {
      topic: config.mqtt.availabilityTopic,
      payload: "offline",
      qos: 1,
      retain: true,
    },
  });

  client.on("connect", () => {
    logger.info(`connected to mqtt broker at ${config.mqtt.host}:${config.mqtt.port}`);
    client.publish(config.mqtt.availabilityTopic, "online", { qos: 1, retain: true });
    client.subscribe(config.mqtt.commandTopic, { qos: 1 }, (err) => {
      if (err) {
        logger.error(`failed to subscribe to ${config.mqtt.commandTopic}: ${err.message}`);
      } else {
        logger.info(`subscribed to ${config.mqtt.commandTopic}`);
      }
    });
  });

  client.on("error", (err) => {
    logger.error(`mqtt client error: ${err.message}`);
  });

  client.on("message", (topic, payloadBuffer) => {
    if (topic !== config.mqtt.commandTopic) {
      return;
    }

    let payload;
    try {
      payload = parseCommandPayload(payloadBuffer);
    } catch (err) {
      logger.warn(`ignoring malformed command payload on ${topic}: ${(err as Error).message}`);
      return;
    }

    handleCommand(payload, {
      fifoPath: config.pianobar.fifoPath,
      processManager,
      stationDirectory,
      logger,
    }).catch((err: unknown) => {
      logger.error(`unhandled error processing command: ${(err as Error).message}`);
    });
  });

  return client;
}

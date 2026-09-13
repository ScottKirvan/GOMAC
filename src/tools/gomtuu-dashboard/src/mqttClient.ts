import mqtt, { type MqttClient } from "mqtt";
import type { DashboardConfig } from "./config.js";
import type { DashboardStores } from "./dashboardState.js";
import { recordPowerSample } from "./history.js";
import type { Logger } from "./logger.js";
import { handlePandoraMessage } from "./pandoraState.js";
import { handleVictronMessage, summarizePower } from "./victronState.js";

export function connectMqtt(
  config: DashboardConfig,
  stores: DashboardStores,
  logger: Logger,
  onUpdate: () => void,
): MqttClient {
  const client = mqtt.connect({
    host: config.mqtt.host,
    port: config.mqtt.port,
    username: config.mqtt.username,
    password: config.mqtt.password,
    clientId: config.mqtt.clientId,
  });

  client.on("connect", () => {
    logger.info(`connected to mqtt broker at ${config.mqtt.host}:${config.mqtt.port}`);
    for (const topic of [config.mqtt.victronTopicFilter, `${config.mqtt.pandoraTopicPrefix}/#`]) {
      client.subscribe(topic, { qos: 0 }, (err) => {
        if (err) {
          logger.error(`failed to subscribe to ${topic}: ${err.message}`);
        } else {
          logger.info(`subscribed to ${topic}`);
        }
      });
    }
  });

  client.on("error", (err) => {
    logger.error(`mqtt client error: ${err.message}`);
  });

  client.on("message", (topic, payloadBuffer) => {
    const payload = payloadBuffer.toString("utf8");

    if (topic.startsWith("victron-ble/")) {
      handleVictronMessage(stores.victron, topic, payload);
      recordPowerSample(stores.powerHistory, summarizePower(stores.victron));
      onUpdate();
      return;
    }

    if (topic.startsWith(`${config.mqtt.pandoraTopicPrefix}/`)) {
      handlePandoraMessage(stores.nowPlaying, topic, payload);
      onUpdate();
    }
  });

  return client;
}

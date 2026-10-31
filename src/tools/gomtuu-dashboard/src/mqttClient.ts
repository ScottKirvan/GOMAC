import mqtt, { type MqttClient } from "mqtt";
import { handleConnectivityMessage, summarizeConnectivity } from "./connectivityState.js";
import { recordConnectivitySample } from "./connectivityHistory.js";
import type { DashboardConfig } from "./config.js";
import { currentEnergyFlows, type DashboardStores } from "./dashboardState.js";
import { recordPowerSample } from "./history.js";
import { recordSolarPower } from "./solarPeak.js";
import type { Logger } from "./logger.js";
import { handlePandoraMessage } from "./pandoraState.js";
import { handlePositionMessage } from "./positionState.js";
import { handleStarlinkMessage } from "./starlinkState.js";
import { handleVictronMessage, summarizePower } from "./victronState.js";

/** A connection closed this soon after opening counts as a quick drop. */
const QUICK_DROP_MS = 5_000;
/** This many quick drops in a row triggers the warning. */
const QUICK_DROPS_TO_WARN = 3;
/** A connection that lasts this long re-arms the warning. */
const STABLE_CONNECTION_MS = 60_000;

/**
 * Notices the broker closing the connection right after each connect, the
 * signature of another client taking over this client ID's session, and
 * warns once per episode instead of letting it pass as routine reconnects.
 */
export function createReconnectWatch(logger: Logger, clientId: string) {
  let connectedAt: number | undefined;
  let quickDrops = 0;
  let warned = false;
  return {
    connected(now: number): void {
      connectedAt = now;
    },
    closed(now: number): void {
      if (connectedAt === undefined) return;
      const lasted = now - connectedAt;
      connectedAt = undefined;
      if (lasted >= STABLE_CONNECTION_MS) {
        quickDrops = 0;
        warned = false;
        return;
      }
      if (lasted > QUICK_DROP_MS) return;
      quickDrops += 1;
      if (quickDrops >= QUICK_DROPS_TO_WARN && !warned) {
        warned = true;
        logger.warn(
          `mqtt connection keeps closing right after connecting (${quickDrops} times in a row); another client may be using client ID "${clientId}"`,
        );
      }
    },
  };
}

export function connectMqtt(
  config: DashboardConfig,
  stores: DashboardStores,
  logger: Logger,
  onUpdate: () => void,
  onNewSolarPeak: () => void = () => {},
): MqttClient {
  const client = mqtt.connect({
    host: config.mqtt.host,
    port: config.mqtt.port,
    username: config.mqtt.username,
    password: config.mqtt.password,
    clientId: config.mqtt.clientId,
  });

  const reconnectWatch = createReconnectWatch(logger, config.mqtt.clientId);
  client.on("close", () => reconnectWatch.closed(Date.now()));

  client.on("connect", () => {
    reconnectWatch.connected(Date.now());
    const topics = [
      config.mqtt.victronTopicFilter,
      `${config.mqtt.pandoraTopicPrefix}/#`,
      `${config.mqtt.positionTopicPrefix}/#`,
      config.mqtt.connectivityTopicFilter,
      "starlink/power_w",
      "starlink/availability",
    ];
    // One log line per connection, so a reconnect costs one line, not five.
    client.subscribe(topics, { qos: 0 }, (err) => {
      if (err) {
        logger.error(`connected to mqtt broker at ${config.mqtt.host}:${config.mqtt.port} as ${config.mqtt.clientId}, but subscribing failed: ${err.message}`);
      } else {
        logger.info(`connected to mqtt broker at ${config.mqtt.host}:${config.mqtt.port} as ${config.mqtt.clientId}; subscribed to ${topics.join(", ")}`);
      }
    });
  });

  client.on("error", (err) => {
    logger.error(`mqtt client error: ${err.message}`);
  });

  client.on("message", (topic, payloadBuffer) => {
    const payload = payloadBuffer.toString("utf8");

    if (topic.startsWith("victron-ble/")) {
      handleVictronMessage(stores.victron, topic, payload);
      const power = summarizePower(stores.victron);
      const now = Date.now();
      recordPowerSample(stores.powerHistory, power, now, currentEnergyFlows(stores, now).chargeW);
      if (recordSolarPower(stores.solarPeak, power.solarPower)) onNewSolarPeak();
      onUpdate();
      return;
    }

    if (topic.startsWith(`${config.mqtt.pandoraTopicPrefix}/`)) {
      handlePandoraMessage(stores.nowPlaying, topic, payload);
      onUpdate();
      return;
    }

    if (topic.startsWith(`${config.mqtt.positionTopicPrefix}/`)) {
      handlePositionMessage(stores.position, topic, payload);
      onUpdate();
      return;
    }

    if (topic.startsWith("starlink/")) {
      handleStarlinkMessage(stores.starlink, topic, payload);
      onUpdate();
      return;
    }

    if (topic.startsWith("ping-monitor/")) {
      handleConnectivityMessage(stores.connectivity, topic, payload);
      recordConnectivitySample(stores.connectivityHistory, summarizeConnectivity(stores.connectivity));
      onUpdate();
    }
  });

  return client;
}

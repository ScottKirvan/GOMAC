import type { DaemonConfig } from "./config.js";
import type { Logger } from "./logger.js";
import { STATE_TOPIC_PREFIX } from "./telemetry.js";

const HA_DISCOVERY_PREFIX = "homeassistant";

/**
 * One HA device per bridge-daemon-spec.md's "own identifiers, not folded
 * into a larger device" convention. Every discovery config below embeds
 * this same block so all entities group under one device in HA's UI.
 */
function haDevice(): Record<string, unknown> {
  return {
    identifiers: ["gomac-pandora"],
    name: "Pandora",
    manufacturer: "GOMAC",
    model: "pianobar bridge",
  };
}

function discoveryTopic(component: string, objectId: string): string {
  return `${HA_DISCOVERY_PREFIX}/${component}/gomac_pandora_${objectId}/config`;
}

export interface DiscoveryConfigMessage {
  topic: string;
  payload: Record<string, unknown>;
}

interface SensorSpec {
  metric: "title" | "artist" | "album" | "station" | "rating";
  name: string;
}

const SENSORS: SensorSpec[] = [
  { metric: "title", name: "Title" },
  { metric: "artist", name: "Artist" },
  { metric: "album", name: "Album" },
  { metric: "station", name: "Station" },
  { metric: "rating", name: "Rating" },
];

function buildSensorDiscoveryConfigs(config: DaemonConfig): DiscoveryConfigMessage[] {
  return SENSORS.map(({ metric, name }) => ({
    topic: discoveryTopic("sensor", metric),
    payload: {
      name,
      unique_id: `gomac_pandora_${metric}`,
      object_id: `pandora_${metric}`,
      state_topic: `${STATE_TOPIC_PREFIX}/${metric}`,
      availability_topic: config.mqtt.availabilityTopic,
      device: haDevice(),
    },
  }));
}

/**
 * `url_topic`, not `image_topic` -- coverArt is confirmed a URL string
 * straight from Pandora's API (see telemetry.ts's doc comment and
 * README.md's "Investigated: what form is coverArt in?"), not raw image
 * bytes, which is what `image_topic` expects instead. Verified against
 * HA's own MQTT image integration docs, not assumed: `url_topic` has HA
 * download the image from the URL it receives; `image_topic` would need
 * this daemon to publish the actual image bytes, which it never has.
 */
function buildImageDiscoveryConfig(config: DaemonConfig): DiscoveryConfigMessage {
  return {
    topic: discoveryTopic("image", "cover_art"),
    payload: {
      name: "Cover Art",
      unique_id: "gomac_pandora_cover_art",
      object_id: "pandora_cover_art",
      url_topic: `${STATE_TOPIC_PREFIX}/cover_art`,
      availability_topic: config.mqtt.availabilityTopic,
      device: haDevice(),
    },
  };
}

interface ButtonSpec {
  objectId: string;
  name: string;
  action: string;
  deviceClass?: string;
}

const BUTTONS: ButtonSpec[] = [
  { objectId: "skip", name: "Skip", action: "next" },
  { objectId: "love", name: "Love", action: "love" },
  { objectId: "ban", name: "Ban", action: "ban" },
  { objectId: "tired", name: "Tired", action: "tired" },
  { objectId: "play", name: "Play", action: "play" },
  { objectId: "pause", name: "Pause", action: "pause" },
  { objectId: "volume_up", name: "Volume Up", action: "volume_up" },
  { objectId: "volume_down", name: "Volume Down", action: "volume_down" },
  { objectId: "restart", name: "Restart Player", action: "restart", deviceClass: "restart" },
];

function buildButtonDiscoveryConfigs(config: DaemonConfig): DiscoveryConfigMessage[] {
  return BUTTONS.map(({ objectId, name, action, deviceClass }) => ({
    topic: discoveryTopic("button", objectId),
    payload: {
      name,
      unique_id: `gomac_pandora_${objectId}`,
      object_id: `pandora_${objectId}`,
      command_topic: config.mqtt.commandTopic,
      payload_press: JSON.stringify({ action }),
      availability_topic: config.mqtt.availabilityTopic,
      device: haDevice(),
      ...(deviceClass !== undefined ? { device_class: deviceClass } : {}),
    },
  }));
}

/**
 * The entities that never change shape after startup: sensors, the image,
 * and the buttons. The station `select` is deliberately excluded here --
 * its `options` list is runtime data (see buildSelectDiscoveryConfig's doc
 * comment) and is built/republished separately whenever the known station
 * list changes.
 */
export function buildStaticDiscoveryConfigs(config: DaemonConfig): DiscoveryConfigMessage[] {
  return [...buildSensorDiscoveryConfigs(config), buildImageDiscoveryConfig(config), ...buildButtonDiscoveryConfigs(config)];
}

/**
 * Investigated against HA's own MQTT discovery docs, not assumed: a select
 * entity's `options` list has no separate "update options" mechanism --
 * it's just a field on the same discovery config payload, set once at
 * whatever moment discovery fires. HA's MQTT discovery docs state
 * "subsequent messages on a topic where a valid payload has been received
 * will be handled as a configuration update", so republishing this exact
 * config message (same discovery topic, same unique_id) with a new
 * `options` array is the documented, correct way to keep the list current
 * -- HA updates the existing entity in place rather than creating a
 * duplicate. This is why the daemon calls this function again every time
 * `StationDirectory` reports a changed station list (see mqttClient.ts),
 * rather than publishing it once at startup and leaving it static.
 *
 * `command_template` renders the selected option into the same
 * `{"action": "select_source", "station": "..."}` shape
 * `commandHandler.ts`'s `select_source` handler already expects --
 * `{{ value }}` is HA's standard MQTT command-template variable for "the
 * value being sent" (the same convention used by MQTT `switch`/`number`/
 * `lock`, etc.).
 */
export function buildSelectDiscoveryConfig(config: DaemonConfig, stations: string[]): DiscoveryConfigMessage {
  return {
    topic: discoveryTopic("select", "station_select"),
    payload: {
      name: "Station",
      unique_id: "gomac_pandora_station_select",
      object_id: "pandora_station",
      command_topic: config.mqtt.commandTopic,
      command_template: '{"action": "select_source", "station": "{{ value }}"}',
      state_topic: `${STATE_TOPIC_PREFIX}/station`,
      options: stations,
      availability_topic: config.mqtt.availabilityTopic,
      device: haDevice(),
    },
  };
}

export interface DiscoveryMqttClient {
  publish(
    topic: string,
    payload: string,
    opts: { qos: 0 | 1 | 2; retain: boolean },
    callback?: (err?: Error) => void,
  ): unknown;
}

export function publishDiscoveryConfigs(
  mqttClient: DiscoveryMqttClient,
  messages: DiscoveryConfigMessage[],
  logger: Logger,
): void {
  for (const message of messages) {
    mqttClient.publish(message.topic, JSON.stringify(message.payload), { qos: 1, retain: true }, (err) => {
      if (err) {
        logger.error(`failed to publish HA discovery config to ${message.topic}: ${err.message}`);
      }
    });
  }
  logger.info(`published ${messages.length} HA discovery config(s)`);
}

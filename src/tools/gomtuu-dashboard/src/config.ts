export interface DashboardConfig {
  mqtt: {
    host: string;
    port: number;
    username?: string;
    password?: string;
    clientId: string;
    victronTopicFilter: string;
    pandoraTopicPrefix: string;
    positionTopicPrefix: string;
    connectivityTopicFilter: string;
  };
  http: {
    port: number;
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): DashboardConfig {
  return {
    mqtt: {
      host: env.MQTT_HOST ?? "127.0.0.1",
      port: Number(env.MQTT_PORT ?? 1883),
      username: env.MQTT_USERNAME,
      password: env.MQTT_PASSWORD,
      clientId: env.MQTT_CLIENT_ID ?? "gomac-dashboard",
      victronTopicFilter: env.VICTRON_TOPIC_FILTER ?? "victron-ble/#",
      pandoraTopicPrefix: env.PANDORA_TOPIC_PREFIX ?? "gomac/pandora/state",
      positionTopicPrefix: env.POSITION_TOPIC_PREFIX ?? "gps/phone",
      connectivityTopicFilter: env.CONNECTIVITY_TOPIC_FILTER ?? "ping-monitor/#",
    },
    http: {
      port: Number(env.HTTP_PORT ?? 8090),
    },
  };
}

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
    host: string;
    privatePort: number;
  };
  weather: {
    pollIntervalMs: number;
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
      // 127.0.0.1 rather than all interfaces: this is also what Tailscale
      // Funnel/Serve require of a backend, so binding here matches both
      // "don't expose to the LAN by accident" and "what Tailscale needs".
      host: env.HTTP_HOST ?? "127.0.0.1",
      port: Number(env.HTTP_PORT ?? 8090),
      // Serves the *unredacted* snapshot (position included). Meant to be
      // published with `tailscale serve` (tailnet-only), never `funnel` --
      // the public port strips position entirely. Kept as a genuinely
      // separate port rather than a second path on the same port because
      // Tailscale's own serve/funnel don't mix reliably per-path on one
      // port (last command wins for the whole port), so port-level
      // separation is the only isolation that's actually load-bearing.
      privatePort: Number(env.HTTP_PRIVATE_PORT ?? 8091),
    },
    weather: {
      pollIntervalMs: Number(env.WEATHER_POLL_INTERVAL_MS ?? 15 * 60 * 1000),
    },
  };
}

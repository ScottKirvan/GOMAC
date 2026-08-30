import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface DaemonConfig {
  mqtt: {
    host: string;
    port: number;
    username?: string;
    password?: string;
    clientId: string;
    commandTopic: string;
    availabilityTopic: string;
  };
  pianobar: {
    binary: string;
    configPath: string;
    fifoPath: string;
    eventCommandPath: string;
    eventSocketPath: string;
    autostartStationId: string;
  };
  pidFilePath: string;
  restartSigtermTimeoutMs: number;
}

interface RawConfigFile {
  mqtt?: {
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    passwordFile?: string;
    clientId?: string;
    commandTopic?: string;
    availabilityTopic?: string;
  };
  pianobar?: {
    binary?: string;
    configPath?: string;
    fifoPath?: string;
    eventCommandPath?: string;
    eventSocketPath?: string;
    autostartStationId?: string;
  };
  pidFilePath?: string;
  restartSigtermTimeoutMs?: number;
}

const DEFAULT_STATE_DIR = join(homedir(), ".local", "state", "gomac-pianobar");

/**
 * A real, verified-working station ID (Tool Radio), not a placeholder
 * guess -- confirmed live during this daemon's own acceptance testing
 * (selecting it by index started playback correctly). Picked per Scott's
 * explicit "any station is fine for now" call after "resume last station"
 * turned out not to be feasible (see pianobarConfig.ts's doc comment for
 * why) -- expected to be overridden via PIANOBAR_AUTOSTART_STATION_ID once
 * a real preference is decided, not treated as a permanent choice.
 */
const DEFAULT_AUTOSTART_STATION_ID = "970427846688346580";

function readConfigFile(path: string | undefined): RawConfigFile {
  if (!path || !existsSync(path)) {
    return {};
  }
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as RawConfigFile;
}

function readPasswordFile(path: string | undefined): string | undefined {
  if (!path) {
    return undefined;
  }
  return readFileSync(path, "utf8").trim();
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): DaemonConfig {
  const fileConfig = readConfigFile(env.GOMAC_PIANOBAR_CONFIG_FILE);

  const passwordFilePath = env.MQTT_PASSWORD_FILE ?? fileConfig.mqtt?.passwordFile;
  const password = env.MQTT_PASSWORD ?? readPasswordFile(passwordFilePath) ?? fileConfig.mqtt?.password;

  return {
    mqtt: {
      host: env.MQTT_HOST ?? fileConfig.mqtt?.host ?? "127.0.0.1",
      port: Number(env.MQTT_PORT ?? fileConfig.mqtt?.port ?? 1883),
      username: env.MQTT_USERNAME ?? fileConfig.mqtt?.username,
      password,
      clientId: env.MQTT_CLIENT_ID ?? fileConfig.mqtt?.clientId ?? "gomac-pianobar-daemon",
      commandTopic: env.MQTT_COMMAND_TOPIC ?? fileConfig.mqtt?.commandTopic ?? "gomac/pandora/cmd",
      availabilityTopic:
        env.MQTT_AVAILABILITY_TOPIC ?? fileConfig.mqtt?.availabilityTopic ?? "gomac/pandora/availability",
    },
    pianobar: {
      binary: env.PIANOBAR_BINARY ?? fileConfig.pianobar?.binary ?? "pianobar",
      configPath:
        env.PIANOBAR_CONFIG_PATH ?? fileConfig.pianobar?.configPath ?? join(homedir(), ".config", "pianobar", "config"),
      fifoPath: env.PIANOBAR_FIFO_PATH ?? fileConfig.pianobar?.fifoPath ?? join(homedir(), ".config", "pianobar", "ctl"),
      eventCommandPath:
        env.PIANOBAR_EVENT_COMMAND_PATH ?? fileConfig.pianobar?.eventCommandPath ?? join(DEFAULT_STATE_DIR, "eventcmd.sh"),
      eventSocketPath:
        env.PIANOBAR_EVENT_SOCKET_PATH ?? fileConfig.pianobar?.eventSocketPath ?? join(DEFAULT_STATE_DIR, "eventcmd.sock"),
      autostartStationId:
        env.PIANOBAR_AUTOSTART_STATION_ID ?? fileConfig.pianobar?.autostartStationId ?? DEFAULT_AUTOSTART_STATION_ID,
    },
    pidFilePath: env.PIANOBAR_PIDFILE_PATH ?? fileConfig.pidFilePath ?? join(DEFAULT_STATE_DIR, "pianobar.pid"),
    restartSigtermTimeoutMs: Number(env.RESTART_SIGTERM_TIMEOUT_MS ?? fileConfig.restartSigtermTimeoutMs ?? 5000),
  };
}

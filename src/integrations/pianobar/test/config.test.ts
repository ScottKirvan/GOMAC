import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gomac-pianobar-config-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("falls back to defaults with no env or config file", () => {
    const config = loadConfig({});

    expect(config.mqtt.host).toBe("127.0.0.1");
    expect(config.mqtt.port).toBe(1883);
    expect(config.mqtt.username).toBeUndefined();
    expect(config.mqtt.password).toBeUndefined();
    expect(config.mqtt.clientId).toBe("gomac-pianobar-daemon");
    expect(config.mqtt.commandTopic).toBe("gomac/pandora/cmd");
    expect(config.mqtt.availabilityTopic).toBe("gomac/pandora/availability");
    expect(config.pianobar.binary).toBe("pianobar");
    expect(config.restartSigtermTimeoutMs).toBe(5000);
  });

  it("prefers env vars over defaults", () => {
    const config = loadConfig({
      MQTT_HOST: "10.0.0.5",
      MQTT_PORT: "8883",
      MQTT_USERNAME: "pandora-bridge",
      MQTT_PASSWORD: "secret",
      PIANOBAR_BINARY: "/usr/bin/pianobar",
      RESTART_SIGTERM_TIMEOUT_MS: "1234",
    });

    expect(config.mqtt.host).toBe("10.0.0.5");
    expect(config.mqtt.port).toBe(8883);
    expect(config.mqtt.username).toBe("pandora-bridge");
    expect(config.mqtt.password).toBe("secret");
    expect(config.pianobar.binary).toBe("/usr/bin/pianobar");
    expect(config.restartSigtermTimeoutMs).toBe(1234);
  });

  it("reads mqtt password from a password file rather than requiring it inline", () => {
    const passwordFile = join(dir, "mqtt-password");
    writeFileSync(passwordFile, "from-file-secret\n");

    const config = loadConfig({ MQTT_PASSWORD_FILE: passwordFile });

    expect(config.mqtt.password).toBe("from-file-secret");
  });

  it("prefers an explicit MQTT_PASSWORD env var over a password file", () => {
    const passwordFile = join(dir, "mqtt-password");
    writeFileSync(passwordFile, "from-file-secret\n");

    const config = loadConfig({ MQTT_PASSWORD: "inline-secret", MQTT_PASSWORD_FILE: passwordFile });

    expect(config.mqtt.password).toBe("inline-secret");
  });

  it("loads values from a JSON config file, with env vars taking precedence", () => {
    const configFile = join(dir, "config.json");
    writeFileSync(
      configFile,
      JSON.stringify({
        mqtt: { host: "file-host", port: 1900 },
        pianobar: { binary: "file-pianobar" },
      }),
    );

    const config = loadConfig({
      GOMAC_PIANOBAR_CONFIG_FILE: configFile,
      MQTT_HOST: "env-host",
    });

    expect(config.mqtt.host).toBe("env-host");
    expect(config.mqtt.port).toBe(1900);
    expect(config.pianobar.binary).toBe("file-pianobar");
  });
});

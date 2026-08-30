import { describe, expect, it, vi } from "vitest";
import type { DaemonConfig } from "../src/config.js";
import {
  buildSelectDiscoveryConfig,
  buildStaticDiscoveryConfigs,
  publishDiscoveryConfigs,
} from "../src/haDiscovery.js";
import type { Logger } from "../src/logger.js";

function fakeLogger(): Logger & { calls: { level: string; message: string }[] } {
  const calls: { level: string; message: string }[] = [];
  return {
    calls,
    info: (message) => calls.push({ level: "info", message }),
    warn: (message) => calls.push({ level: "warn", message }),
    error: (message) => calls.push({ level: "error", message }),
  };
}

function baseConfig(): DaemonConfig {
  return {
    mqtt: {
      host: "127.0.0.1",
      port: 1883,
      clientId: "gomac-pianobar-daemon",
      commandTopic: "gomac/pandora/cmd",
      availabilityTopic: "gomac/pandora/availability",
    },
    pianobar: {
      binary: "pianobar",
      configPath: "/home/test/.config/pianobar/config",
      fifoPath: "/home/test/.config/pianobar/ctl",
      eventCommandPath: "/home/test/.local/state/gomac-pianobar/eventcmd.sh",
      eventSocketPath: "/home/test/.local/state/gomac-pianobar/eventcmd.sock",
      autostartStationId: "970427846688346580",
    },
    pidFilePath: "/home/test/.local/state/gomac-pianobar/pianobar.pid",
    restartSigtermTimeoutMs: 5000,
  };
}

describe("buildStaticDiscoveryConfigs", () => {
  const configs = buildStaticDiscoveryConfigs(baseConfig());

  it("publishes a sensor for each now-playing metric", () => {
    const sensorTopics = configs.filter((c) => c.topic.startsWith("homeassistant/sensor/")).map((c) => c.topic);
    expect(sensorTopics.sort()).toEqual(
      [
        "homeassistant/sensor/gomac_pandora_title/config",
        "homeassistant/sensor/gomac_pandora_artist/config",
        "homeassistant/sensor/gomac_pandora_album/config",
        "homeassistant/sensor/gomac_pandora_station/config",
        "homeassistant/sensor/gomac_pandora_rating/config",
      ].sort(),
    );
  });

  it("points each sensor's state_topic at the matching existing telemetry topic", () => {
    const title = configs.find((c) => c.topic === "homeassistant/sensor/gomac_pandora_title/config");
    expect(title?.payload.state_topic).toBe("gomac/pandora/state/title");

    const rating = configs.find((c) => c.topic === "homeassistant/sensor/gomac_pandora_rating/config");
    expect(rating?.payload.state_topic).toBe("gomac/pandora/state/rating");
  });

  it("publishes the album art image entity wired to url_topic, not image_topic", () => {
    const image = configs.find((c) => c.topic === "homeassistant/image/gomac_pandora_cover_art/config");
    expect(image).toBeDefined();
    expect(image?.payload.url_topic).toBe("gomac/pandora/state/cover_art");
    expect(image?.payload.image_topic).toBeUndefined();
  });

  it("publishes a button for every Tier 1/restart action listed in the phase 3 scope", () => {
    const buttons = configs.filter((c) => c.topic.startsWith("homeassistant/button/"));
    const actions = buttons.map((c) => JSON.parse(c.payload.payload_press as string).action).sort();
    expect(actions).toEqual(
      ["next", "love", "ban", "tired", "play", "pause", "volume_up", "volume_down", "restart"].sort(),
    );
  });

  it("uses the configured command topic for every button's command_topic", () => {
    const buttons = configs.filter((c) => c.topic.startsWith("homeassistant/button/"));
    for (const button of buttons) {
      expect(button.payload.command_topic).toBe("gomac/pandora/cmd");
    }
  });

  it("marks the restart button with the standard HA restart device_class", () => {
    const restart = configs.find((c) => c.topic === "homeassistant/button/gomac_pandora_restart/config");
    expect(restart?.payload.device_class).toBe("restart");
  });

  it("gives every entity the same device block so they group under one HA device", () => {
    const deviceBlocks = configs.map((c) => JSON.stringify(c.payload.device));
    expect(new Set(deviceBlocks).size).toBe(1);
    expect(configs[0]?.payload.device).toEqual({
      identifiers: ["gomac-pandora"],
      name: "Pandora",
      manufacturer: "GOMAC",
      model: "pianobar bridge",
    });
  });

  it("points every entity's availability_topic at the daemon's existing availability topic", () => {
    for (const message of configs) {
      expect(message.payload.availability_topic).toBe("gomac/pandora/availability");
    }
  });

  it("does not include the station select entity", () => {
    expect(configs.some((c) => c.topic.startsWith("homeassistant/select/"))).toBe(false);
  });
});

describe("buildSelectDiscoveryConfig", () => {
  it("uses the given station list as the select's options", () => {
    const config = buildSelectDiscoveryConfig(baseConfig(), ["Alpha", "Bravo"]);
    expect(config.payload.options).toEqual(["Alpha", "Bravo"]);
  });

  it("allows an empty options list before any station list is known", () => {
    const config = buildSelectDiscoveryConfig(baseConfig(), []);
    expect(config.payload.options).toEqual([]);
  });

  it("targets the same discovery topic regardless of the options passed, so republishing updates the entity rather than creating a new one", () => {
    const first = buildSelectDiscoveryConfig(baseConfig(), ["Alpha"]);
    const second = buildSelectDiscoveryConfig(baseConfig(), ["Alpha", "Bravo", "Charlie"]);
    expect(first.topic).toBe(second.topic);
    expect(first.payload.unique_id).toBe(second.payload.unique_id);
  });

  it("uses a command_template that renders select_source with the chosen station", () => {
    const config = buildSelectDiscoveryConfig(baseConfig(), ["Alpha"]);
    expect(config.payload.command_topic).toBe("gomac/pandora/cmd");
    expect(config.payload.command_template).toContain("select_source");
    expect(config.payload.command_template).toContain("{{ value }}");
  });

  it("reflects the currently playing station via the existing station state topic", () => {
    const config = buildSelectDiscoveryConfig(baseConfig(), ["Alpha"]);
    expect(config.payload.state_topic).toBe("gomac/pandora/state/station");
  });

  it("includes the shared device block and availability topic", () => {
    const config = buildSelectDiscoveryConfig(baseConfig(), []);
    expect(config.payload.device).toEqual({
      identifiers: ["gomac-pandora"],
      name: "Pandora",
      manufacturer: "GOMAC",
      model: "pianobar bridge",
    });
    expect(config.payload.availability_topic).toBe("gomac/pandora/availability");
  });
});

describe("publishDiscoveryConfigs", () => {
  it("publishes each message retained at qos 1 as a JSON string", () => {
    const publish = vi.fn();
    const logger = fakeLogger();
    const messages = [
      { topic: "homeassistant/sensor/x/config", payload: { name: "X" } },
      { topic: "homeassistant/button/y/config", payload: { name: "Y" } },
    ];

    publishDiscoveryConfigs({ publish }, messages, logger);

    expect(publish).toHaveBeenCalledWith(
      "homeassistant/sensor/x/config",
      JSON.stringify({ name: "X" }),
      { qos: 1, retain: true },
      expect.any(Function),
    );
    expect(publish).toHaveBeenCalledWith(
      "homeassistant/button/y/config",
      JSON.stringify({ name: "Y" }),
      { qos: 1, retain: true },
      expect.any(Function),
    );
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it("logs an error rather than throwing when a publish callback reports failure", () => {
    const logger = fakeLogger();
    const publish = vi.fn((_topic: string, _payload: string, _opts: unknown, cb?: (err?: Error) => void) => {
      cb?.(new Error("not connected"));
    });

    publishDiscoveryConfigs({ publish }, [{ topic: "homeassistant/sensor/x/config", payload: {} }], logger);

    expect(logger.calls.some((c) => c.level === "error")).toBe(true);
  });
});

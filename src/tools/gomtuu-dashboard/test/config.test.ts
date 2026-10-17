import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig MQTT client ID", () => {
  it("defaults to an ID unique to this process, so two instances never take over each other's session", () => {
    const a = loadConfig({}).mqtt.clientId;
    const b = loadConfig({}).mqtt.clientId;
    expect(a).toMatch(/^gomac-dashboard-/);
    expect(a).not.toBe(b);
  });

  it("uses MQTT_CLIENT_ID when set", () => {
    expect(loadConfig({ MQTT_CLIENT_ID: "dashboard-preview" }).mqtt.clientId).toBe("dashboard-preview");
  });
});

import { describe, expect, it } from "vitest";
import { createVictronStore, handleVictronMessage, parseVictronTopic, summarizePower } from "../src/victronState.js";

describe("parseVictronTopic", () => {
  it("parses a well-formed victron-ble topic", () => {
    expect(parseVictronTopic("victron-ble/AA:BB:CC/battery_voltage")).toEqual({
      mac: "AA:BB:CC",
      metric: "battery_voltage",
    });
  });

  it("returns undefined for topics outside victron-ble", () => {
    expect(parseVictronTopic("gomac/pandora/state/title")).toBeUndefined();
  });

  it("returns undefined for the wrong number of segments", () => {
    expect(parseVictronTopic("victron-ble/AA:BB:CC")).toBeUndefined();
    expect(parseVictronTopic("victron-ble/AA:BB:CC/battery/extra")).toBeUndefined();
  });
});

describe("handleVictronMessage + summarizePower", () => {
  it("groups metrics by device and reads battery fields off the SOC-reporting device", () => {
    const store = createVictronStore();
    handleVictronMessage(store, "victron-ble/BMV:MAC/soc", "82");
    handleVictronMessage(store, "victron-ble/BMV:MAC/battery_voltage", "13.14");
    handleVictronMessage(store, "victron-ble/BMV:MAC/battery_current", "4.2");
    handleVictronMessage(store, "victron-ble/BMV:MAC/temperature", "24.1");

    const summary = summarizePower(store);
    expect(summary.batteryDeviceMac).toBe("BMV:MAC");
    expect(summary.soc).toBe(82);
    expect(summary.voltage).toBe(13.14);
    expect(summary.current).toBe(4.2);
    expect(summary.temperature).toBe(24.1);
  });

  it("reads solar power off a different device than the battery monitor", () => {
    const store = createVictronStore();
    handleVictronMessage(store, "victron-ble/BMV:MAC/soc", "82");
    handleVictronMessage(store, "victron-ble/MPPT:MAC/solar_power", "184");

    const summary = summarizePower(store);
    expect(summary.solarDeviceMac).toBe("MPPT:MAC");
    expect(summary.solarPower).toBe(184);
  });

  it("keeps every raw metric available even when nothing matches the hero-field patterns", () => {
    const store = createVictronStore();
    handleVictronMessage(store, "victron-ble/AA:BB/some_unrecognized_field", "hello");

    expect(store.devices["AA:BB"]?.metrics.some_unrecognized_field?.value).toBe("hello");
    expect(summarizePower(store)).toEqual({});
  });

  it("ignores malformed topics", () => {
    const store = createVictronStore();
    handleVictronMessage(store, "not-victron/AA:BB/metric", "1");
    expect(store.devices).toEqual({});
  });
});

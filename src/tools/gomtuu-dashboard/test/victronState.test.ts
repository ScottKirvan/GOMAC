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

  it("reads consumed_ah off the battery device, Victron's negative-since-full convention intact", () => {
    const store = createVictronStore();
    handleVictronMessage(store, "victron-ble/BMV:MAC/soc", "85.2");
    handleVictronMessage(store, "victron-ble/BMV:MAC/consumed_ah", "-31.0");

    const summary = summarizePower(store);
    expect(summary.consumedAh).toBe(-31.0);
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

describe("device names", () => {
  it("stores the retained name topic as the device name, not as a metric", () => {
    const store = createVictronStore();
    handleVictronMessage(store, "victron-ble/e0b42569296f/name", "SmartBMV HQ25363ZHH4");
    handleVictronMessage(store, "victron-ble/e0b42569296f/soc", "68.1");

    const device = store.devices["e0b42569296f"]!;
    expect(device.name).toBe("SmartBMV HQ25363ZHH4");
    expect(device.metrics).not.toHaveProperty("name");
    expect(Object.keys(device.metrics)).toEqual(["soc"]);
  });

  it("clears the name when the retained topic is emptied", () => {
    const store = createVictronStore();
    handleVictronMessage(store, "victron-ble/e0b42569296f/name", "SmartBMV HQ25363ZHH4");
    handleVictronMessage(store, "victron-ble/e0b42569296f/name", "");
    expect(store.devices["e0b42569296f"]!.name).toBeUndefined();
  });

  it("carries the battery and solar device names into the power summary", () => {
    const store = createVictronStore();
    handleVictronMessage(store, "victron-ble/e0b42569296f/name", "SmartBMV HQ25363ZHH4");
    handleVictronMessage(store, "victron-ble/e0b42569296f/soc", "68.1");
    handleVictronMessage(store, "victron-ble/dd1cc7607ae4/name", "SmartSolar HQ18523S6FC");
    handleVictronMessage(store, "victron-ble/dd1cc7607ae4/solar_power", "59");

    const summary = summarizePower(store);
    expect(summary.batteryDeviceName).toBe("SmartBMV HQ25363ZHH4");
    expect(summary.solarDeviceName).toBe("SmartSolar HQ18523S6FC");
  });

  it("leaves names undefined until a name topic arrives", () => {
    const store = createVictronStore();
    handleVictronMessage(store, "victron-ble/e0b42569296f/soc", "68.1");
    expect(store.devices["e0b42569296f"]!.name).toBeUndefined();
    expect(summarizePower(store).batteryDeviceName).toBeUndefined();
  });
});

describe("battery power and freshness", () => {
  it("derives battery power from voltage and current when the shunt sends no power reading", () => {
    const store = createVictronStore();
    handleVictronMessage(store, "victron-ble/shunt/soc", "68", 1000);
    handleVictronMessage(store, "victron-ble/shunt/voltage", "13.2", 1000);
    handleVictronMessage(store, "victron-ble/shunt/current", "-4.5", 2000);
    const summary = summarizePower(store);
    expect(summary.power).toBeCloseTo(-59.4, 6);
  });

  it("prefers a reported power reading over the derived one", () => {
    const store = createVictronStore();
    handleVictronMessage(store, "victron-ble/shunt/soc", "68", 1000);
    handleVictronMessage(store, "victron-ble/shunt/voltage", "13.2", 1000);
    handleVictronMessage(store, "victron-ble/shunt/current", "-4.5", 1000);
    handleVictronMessage(store, "victron-ble/shunt/power", "-60", 1000);
    expect(summarizePower(store).power).toBe(-60);
  });
});

describe("device availability", () => {
  it("stores the retained availability topic on the device, not as a metric", () => {
    const store = createVictronStore();
    handleVictronMessage(store, "victron-ble/f0ead52388a9/output_voltage1", "13.2");
    handleVictronMessage(store, "victron-ble/f0ead52388a9/availability", "offline");
    const device = store.devices["f0ead52388a9"]!;
    expect(device.available).toBe(false);
    expect(device.metrics).not.toHaveProperty("availability");
    handleVictronMessage(store, "victron-ble/f0ead52388a9/availability", "online");
    expect(device.available).toBe(true);
  });

  it("treats an unknown availability payload as unknown, not offline", () => {
    const store = createVictronStore();
    handleVictronMessage(store, "victron-ble/f0ead52388a9/availability", "maybe");
    expect(store.devices["f0ead52388a9"]!.available).toBeUndefined();
  });

  it("reports whether the battery monitor is online in the power summary", () => {
    const store = createVictronStore();
    handleVictronMessage(store, "victron-ble/shunt/soc", "68");
    expect(summarizePower(store).batteryOnline).toBeUndefined();
    handleVictronMessage(store, "victron-ble/shunt/availability", "offline");
    expect(summarizePower(store).batteryOnline).toBe(false);
  });
});

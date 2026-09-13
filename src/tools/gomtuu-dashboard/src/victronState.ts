import type { PowerSummary, VictronDeviceState } from "./types.js";

/**
 * Exact metric names published by `victron-ble-monitor.py` are NOT
 * confirmed against the live broker as of this file being written --
 * `notes/dev/compute-hub-current-state.md` only confirms the topic shape
 * (`victron-ble/<mac>/<metric>`) and gives one HA entity name as an
 * example (`sensor.mppt_100_15_solar_charger_battery_voltage`), not a
 * full field list. Rather than hardcode guessed metric names (the
 * "implemented a fix before verifying the assumption" mistake logged in
 * mistakes.md), this matches metric names loosely by keyword so it keeps
 * working even if the guess is slightly off, and every raw metric --
 * matched or not -- still surfaces in `devices`, so nothing is hidden if
 * the alias patterns below turn out wrong. Verify with
 * `mosquitto_sub -h 127.0.0.1 -t 'victron-ble/#' -v` on TheFlea before
 * relying on the Power Gauge widget; the raw per-device tables are the
 * ground truth regardless.
 */
const METRIC_PATTERNS = {
  soc: /soc|state_of_charge/i,
  voltage: /voltage/i,
  current: /current/i,
  power: /(?<!solar_|panel_|pv_)power/i,
  temperature: /temp/i,
  chargerState: /charge_?state|charging_?state|charger_?state/i,
  solarPower: /solar_?power|panel_?power|pv_?power/i,
} as const;

export interface VictronStore {
  devices: Record<string, VictronDeviceState>;
}

export function createVictronStore(): VictronStore {
  return { devices: {} };
}

/**
 * `victron-ble/<mac>/<metric>` -- returns undefined for anything else so
 * callers can ignore topics outside this shape rather than guess.
 */
export function parseVictronTopic(topic: string): { mac: string; metric: string } | undefined {
  const parts = topic.split("/");
  if (parts.length !== 3 || parts[0] !== "victron-ble") {
    return undefined;
  }
  const mac = parts[1];
  const metric = parts[2];
  if (!mac || !metric) {
    return undefined;
  }
  return { mac, metric };
}

export function handleVictronMessage(store: VictronStore, topic: string, payload: string, now: number = Date.now()): void {
  const parsed = parseVictronTopic(topic);
  if (!parsed) {
    return;
  }
  const { mac, metric } = parsed;
  const device = (store.devices[mac] ??= { mac, metrics: {} });
  device.metrics[metric] = { value: payload, updatedAt: now };
}

function findMetric(device: VictronDeviceState, pattern: RegExp): { metric: string; value: string } | undefined {
  for (const [metric, data] of Object.entries(device.metrics)) {
    if (pattern.test(metric)) {
      return { metric, value: data.value };
    }
  }
  return undefined;
}

function toNumber(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Picks "the battery device" as whichever device publishes something
 * matching the SOC pattern, then reads voltage/current/power/temperature
 * from that same device -- and separately scans every device for a
 * solar-power-shaped metric, since that's expected to live on a
 * different device (the MPPT) than the SOC-reporting one (the shunt).
 */
export function summarizePower(store: VictronStore): PowerSummary {
  const summary: PowerSummary = {};

  const batteryDevice = Object.values(store.devices).find((d) => findMetric(d, METRIC_PATTERNS.soc));
  if (batteryDevice) {
    summary.batteryDeviceMac = batteryDevice.mac;
    summary.soc = toNumber(findMetric(batteryDevice, METRIC_PATTERNS.soc)?.value);
    summary.voltage = toNumber(findMetric(batteryDevice, METRIC_PATTERNS.voltage)?.value);
    summary.current = toNumber(findMetric(batteryDevice, METRIC_PATTERNS.current)?.value);
    summary.power = toNumber(findMetric(batteryDevice, METRIC_PATTERNS.power)?.value);
    summary.temperature = toNumber(findMetric(batteryDevice, METRIC_PATTERNS.temperature)?.value);
    summary.chargerState = findMetric(batteryDevice, METRIC_PATTERNS.chargerState)?.value;
  }

  for (const device of Object.values(store.devices)) {
    const solar = findMetric(device, METRIC_PATTERNS.solarPower);
    if (solar) {
      summary.solarPower = toNumber(solar.value);
      summary.solarDeviceMac = device.mac;
      if (summary.chargerState === undefined) {
        summary.chargerState = findMetric(device, METRIC_PATTERNS.chargerState)?.value;
      }
      break;
    }
  }

  return summary;
}

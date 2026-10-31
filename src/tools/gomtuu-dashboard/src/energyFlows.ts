import type { StarlinkSummary } from "./starlinkState.js";
import type { EnergyFlows, VictronDeviceState } from "./types.js";
import { summarizePower, type VictronStore } from "./victronState.js";

/**
 * Where the power is coming from and going, in watts, for the Charge and
 * Draw gauges. Solar, shore, the solar charger's load output and Starlink
 * are measured. The shunt measures the battery's net flow, so whatever
 * isn't accounted for is either the ghost load (unmeasured consumers) or,
 * while the Orion is charging, the alternator: the Orion doesn't report
 * its current over BLE. With two unknowns and one balance, the ghost load
 * is worked out only while the Orion is off, and held (as an estimate)
 * while it charges, so the alternator gets the rest.
 */
export interface GhostHold {
  w?: number;
  at?: number;
}

const GHOST_HOLD_MAX_AGE_MS = 60 * 60 * 1000;
const ORION_IDLE_STATES = new Set(["OFF", "FAULT", "NOT_AVAILABLE", "LOW_POWER"]);

export function createGhostHold(): GhostHold {
  return {};
}

function num(device: VictronDeviceState | undefined, metric: string): number | undefined {
  const raw = device?.metrics[metric]?.value;
  if (raw === undefined || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function online(device: VictronDeviceState | undefined): boolean {
  return device !== undefined && device.available !== false;
}

/** Each kind of device is recognized by the readings it sends, as on the device cards. */
function findDevice(store: VictronStore, metric: string): VictronDeviceState | undefined {
  return Object.values(store.devices).find((d) => metric in d.metrics);
}

function watts(device: VictronDeviceState | undefined, amps: string, volts: string): number {
  return (num(device, amps) ?? 0) * (num(device, volts) ?? 0);
}

export function computeEnergyFlows(store: VictronStore, starlink: StarlinkSummary, hold: GhostHold, now: number = Date.now()): EnergyFlows {
  const solarCharger = findDevice(store, "solar_power");
  const shore = findDevice(store, "output_current1");
  const orion = findDevice(store, "off_reason");

  // Battery side, so it balances against the shunt (PV watts include conversion loss).
  // An offline MPPT is unheard, not off (it runs from the battery), so its
  // flows, and everything inferred from them, are unknown. An offline shore
  // charger is unplugged: 0 W.
  const mpptHeard = online(solarCharger);
  const solarW = mpptHeard ? watts(solarCharger, "battery_charging_current", "battery_voltage") : undefined;
  const loadW = mpptHeard ? watts(solarCharger, "external_device_load", "battery_voltage") : undefined;
  const shoreW = online(shore) ? watts(shore, "output_current1", "output_voltage1") : 0;
  const starlinkW = starlink.powerW ?? 0;
  const orionCharging = online(orion) && !ORION_IDLE_STATES.has(orion?.metrics.charge_state?.value.toUpperCase() ?? "OFF");

  const flows: EnergyFlows = { solarW, shoreW, loadW, starlinkW, starlinkPeakW: starlink.peakW, ghostEstimated: orionCharging };
  const batteryW = summarizePower(store).power;
  if (solarW === undefined || loadW === undefined) return flows;
  if (batteryW === undefined) {
    flows.chargeW = solarW + shoreW;
    return flows;
  }

  const outW = batteryW + starlinkW + loadW;
  if (orionCharging) {
    const held = hold.at !== undefined && now - hold.at <= GHOST_HOLD_MAX_AGE_MS ? (hold.w ?? 0) : 0;
    flows.ghostW = held;
    flows.alternatorW = Math.max(0, outW + held - solarW - shoreW);
  } else {
    flows.ghostW = Math.max(0, solarW + shoreW - outW);
    flows.alternatorW = 0;
    hold.w = flows.ghostW;
    hold.at = now;
  }
  flows.chargeW = solarW + flows.alternatorW + shoreW;
  flows.drawW = starlinkW + loadW + flows.ghostW;
  return flows;
}

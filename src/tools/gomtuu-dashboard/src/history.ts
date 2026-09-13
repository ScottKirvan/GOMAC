import type { PowerSample, PowerSummary } from "./types.js";

export interface PowerHistory {
  samples: PowerSample[];
}

/**
 * victron-ble-monitor.py publishes on a 1-minute systemd timer (per
 * compute-hub-current-state.md), so 500 samples covers well over 6 hours
 * even with the mild oversampling below -- kept simple rather than
 * debounced per-minute, since a few extra near-duplicate points per cycle
 * cost nothing visually.
 */
const MAX_SAMPLES = 500;

export function createPowerHistory(): PowerHistory {
  return { samples: [] };
}

export function recordPowerSample(history: PowerHistory, summary: PowerSummary, now: number = Date.now()): void {
  if (summary.soc === undefined && summary.voltage === undefined && summary.solarPower === undefined) {
    return;
  }
  history.samples.push({
    t: now,
    soc: summary.soc,
    voltage: summary.voltage,
    power: summary.power,
    solarPower: summary.solarPower,
  });
  if (history.samples.length > MAX_SAMPLES) {
    history.samples.shift();
  }
}

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { PowerSample, PowerSummary } from "./types.js";

export interface PowerHistory {
  samples: PowerSample[];
  /** The battery reading energy was last counted from (see recordPowerSample). */
  lastBatteryReading?: { at: number; power: number };
}

/**
 * Series behind the trend chart. Readings are merged into 10-second buckets
 * (Victron devices publish about once a second each). 48 hours are kept so
 * the chart can show a full day, including the previous one, and the series
 * is saved to disk so restarts and deploys don't blank it.
 */
const RETENTION_MS = 48 * 60 * 60 * 1000;
const SAMPLE_BUCKET_MS = 10 * 1000;
/**
 * The shunt publishes only when a value changes, so readings can be a few
 * seconds apart while charging is steady. A longer silence means it stopped
 * reporting, and that gap isn't counted as charging.
 */
const MAX_CHARGE_GAP_MS = 60 * 1000;

export function createPowerHistory(): PowerHistory {
  return { samples: [] };
}

/**
 * Energy charged since the previous battery reading, counted once per new
 * shunt reading (recordPowerSample also runs on every other device's
 * messages). Uses the previous reading's power over the gap since then.
 */
function chargedWhSinceLastReading(history: PowerHistory, summary: PowerSummary): number {
  const at = summary.batteryUpdatedAt;
  if (at === undefined || summary.power === undefined) return 0;
  const last = history.lastBatteryReading;
  if (last !== undefined && at <= last.at) return 0;
  history.lastBatteryReading = { at, power: summary.power };
  if (last === undefined) return 0;
  const gap = at - last.at;
  if (gap > MAX_CHARGE_GAP_MS || last.power <= 0) return 0;
  return (last.power * gap) / 3_600_000;
}

export function recordPowerSample(history: PowerHistory, summary: PowerSummary, now: number = Date.now()): void {
  if (summary.soc === undefined && summary.voltage === undefined && summary.solarPower === undefined) {
    return;
  }
  const chargedWh = chargedWhSinceLastReading(history, summary);
  const newest = history.samples[history.samples.length - 1];
  if (newest !== undefined && now - newest.t >= 0 && now - newest.t < SAMPLE_BUCKET_MS) {
    // Latest value wins, except solarPower keeps the bucket's max so the
    // chart doesn't hide short spikes, and chargedWh accumulates.
    newest.soc = summary.soc ?? newest.soc;
    newest.voltage = summary.voltage ?? newest.voltage;
    newest.power = summary.power ?? newest.power;
    if (summary.solarPower !== undefined) {
      newest.solarPower =
        newest.solarPower === undefined ? summary.solarPower : Math.max(newest.solarPower, summary.solarPower);
    }
    if (chargedWh > 0) newest.chargedWh = (newest.chargedWh ?? 0) + chargedWh;
  } else {
    history.samples.push({
      t: now,
      soc: summary.soc,
      voltage: summary.voltage,
      power: summary.power,
      solarPower: summary.solarPower,
      ...(chargedWh > 0 ? { chargedWh } : {}),
    });
  }

  const cutoff = now - RETENTION_MS;
  let oldest = history.samples[0];
  while (oldest !== undefined && oldest.t < cutoff) {
    history.samples.shift();
    oldest = history.samples[0];
  }
}

/** Samples from the last `spanMs`, oldest first. */
export function recentSamples(history: PowerHistory, spanMs: number, now: number = Date.now()): PowerSample[] {
  const cutoff = now - spanMs;
  const first = history.samples.findIndex((s) => s.t >= cutoff);
  return first === -1 ? [] : history.samples.slice(first);
}

export function loadPowerHistory(path: string, now: number = Date.now()): PowerHistory {
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as { samples?: unknown };
    if (Array.isArray(raw.samples)) {
      const cutoff = now - RETENTION_MS;
      const samples = (raw.samples as PowerSample[]).filter((s) => typeof s?.t === "number" && s.t >= cutoff);
      return { samples };
    }
  } catch {
    // Missing or unreadable file: start with an empty history.
  }
  return createPowerHistory();
}

export function savePowerHistory(history: PowerHistory, path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify({ samples: history.samples }));
  renameSync(tmp, path);
}

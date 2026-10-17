import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { PowerSample, PowerSummary } from "./types.js";

export interface PowerHistory {
  samples: PowerSample[];
  /** When energy was last counted, and the battery state as of then (see chargedWhSinceLast). */
  lastCount?: { at: number; power?: number; online: boolean };
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
 * Messages from some Victron device normally arrive every second or so. A
 * longer silence means the feed itself stopped (e.g. MQTT down), and that
 * time isn't counted as charging.
 */
const MAX_COUNT_GAP_MS = 60 * 1000;

export function createPowerHistory(): PowerHistory {
  return { samples: [] };
}

/**
 * Energy charged since the previous call, at the battery power as of then.
 * Counted by elapsed time rather than per shunt reading, because the shunt
 * publishes only when a value changes, so steady charging produces no new
 * readings. Time while the battery monitor is offline isn't counted.
 */
function chargedWhSinceLast(history: PowerHistory, summary: PowerSummary, now: number): number {
  const last = history.lastCount;
  history.lastCount = { at: now, power: summary.power, online: summary.batteryOnline !== false };
  if (last === undefined || !last.online || last.power === undefined || last.power <= 0) return 0;
  const gap = now - last.at;
  if (gap <= 0 || gap > MAX_COUNT_GAP_MS) return 0;
  return (last.power * gap) / 3_600_000;
}

export function recordPowerSample(history: PowerHistory, summary: PowerSummary, now: number = Date.now()): void {
  if (summary.soc === undefined && summary.voltage === undefined && summary.solarPower === undefined) {
    return;
  }
  const chargedWh = chargedWhSinceLast(history, summary, now);
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

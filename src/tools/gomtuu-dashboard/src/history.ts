import type { PowerSample, PowerSummary } from "./types.js";

export interface PowerHistory {
  samples: PowerSample[];
}

/**
 * Rolling series behind the trend chart only -- "recent peak" lives in
 * solarPeak.ts. Pruned purely by age (no sample-count cap). Readings are
 * merged into 10-second buckets because victron-ble traffic runs ~12
 * MQTT messages/second; 1h of buckets is ~360 points, which is all the
 * chart can draw anyway.
 */
const CHART_WINDOW_MS = 60 * 60 * 1000;
const SAMPLE_BUCKET_MS = 10 * 1000;

export function createPowerHistory(): PowerHistory {
  return { samples: [] };
}

export function recordPowerSample(history: PowerHistory, summary: PowerSummary, now: number = Date.now()): void {
  if (summary.soc === undefined && summary.voltage === undefined && summary.solarPower === undefined) {
    return;
  }
  const newest = history.samples[history.samples.length - 1];
  if (newest !== undefined && now - newest.t >= 0 && now - newest.t < SAMPLE_BUCKET_MS) {
    // Latest value wins, except solarPower keeps the bucket's max so the
    // chart doesn't hide short spikes.
    newest.soc = summary.soc ?? newest.soc;
    newest.voltage = summary.voltage ?? newest.voltage;
    newest.power = summary.power ?? newest.power;
    if (summary.solarPower !== undefined) {
      newest.solarPower =
        newest.solarPower === undefined ? summary.solarPower : Math.max(newest.solarPower, summary.solarPower);
    }
  } else {
    history.samples.push({
      t: now,
      soc: summary.soc,
      voltage: summary.voltage,
      power: summary.power,
      solarPower: summary.solarPower,
    });
  }

  const cutoff = now - CHART_WINDOW_MS;
  let oldest = history.samples[0];
  while (oldest !== undefined && oldest.t < cutoff) {
    history.samples.shift();
    oldest = history.samples[0];
  }
}

import type { PowerSample, PowerSummary } from "./types.js";

export interface PowerHistory {
  samples: PowerSample[];
}

/**
 * Retention window for "recent peak" and the trend chart: samples older
 * than this are pruned on every insert. This used to be a fixed sample
 * COUNT (500) on the theory that victron-ble-monitor.py's 1-minute timer
 * made that "well over 6 hours" of coverage -- wrong in practice, because
 * a sample is appended on essentially every victron-ble MQTT message, not
 * once per scan cycle. With today's 4 devices (~18-20 messages/minute
 * combined), 500 samples covered barely 25-30 minutes, and that span
 * shrinks further as devices/metrics are added -- making "recent peak"
 * nearly meaningless (you're almost always at or near the peak of a
 * window that short). Pruning by actual elapsed time instead means the
 * window means what it says regardless of how many devices are reporting.
 */
const PEAK_WINDOW_MS = 60 * 60 * 1000;

/**
 * Samples are bucketed: a reading that arrives within SAMPLE_BUCKET_MS of
 * the newest retained sample is merged into it instead of appended. Real
 * victron-ble MQTT traffic measured on 2026-10-01 was ~12 messages/second
 * (one per device per metric, not one per scan cycle), so appending every
 * message hit the old 10,000 cap after ~14 minutes -- silently shrinking
 * the "1-hour" window back to ~14 min -- and bloated /snapshot.json to
 * hundreds of KB per 10s poll. 10s buckets give ~360 samples/hour, which is
 * still finer than the trend chart can draw.
 */
const SAMPLE_BUCKET_MS = 10 * 1000;

/**
 * Absolute ceiling on retained samples, independent of PEAK_WINDOW_MS --
 * a defensive backstop against unbounded growth (e.g. a clock jump), not
 * the normal pruning mechanism. Bucketing caps a normal hour at ~360.
 */
const MAX_SAMPLES = 1000;

export function createPowerHistory(): PowerHistory {
  return { samples: [] };
}

export function recordPowerSample(history: PowerHistory, summary: PowerSummary, now: number = Date.now()): void {
  if (summary.soc === undefined && summary.voltage === undefined && summary.solarPower === undefined) {
    return;
  }
  const newest = history.samples[history.samples.length - 1];
  if (newest !== undefined && now - newest.t >= 0 && now - newest.t < SAMPLE_BUCKET_MS) {
    // Latest value wins for the trend fields, but solarPower keeps the
    // bucket's max so "recent peak" never loses a spike to merging.
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

  const cutoff = now - PEAK_WINDOW_MS;
  let oldest = history.samples[0];
  while (oldest !== undefined && oldest.t < cutoff) {
    history.samples.shift();
    oldest = history.samples[0];
  }
  if (history.samples.length > MAX_SAMPLES) {
    history.samples.shift();
  }
}

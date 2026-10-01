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
 * Absolute ceiling on retained samples, independent of PEAK_WINDOW_MS --
 * a defensive backstop against unbounded growth if something pathological
 * happens (a clock jump, a misbehaving publisher flooding messages), not
 * the normal pruning mechanism. At today's real-world message rate this
 * ceiling is never reached within the 1-hour window; it only bites if the
 * message rate were to increase roughly 15x+ over current levels.
 */
const MAX_SAMPLES = 10000;

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

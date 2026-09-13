import type { ConnectivitySample, ConnectivitySummary } from "./types.js";

/**
 * ping-monitor publishes 3 targets x 2 metrics every minute (6 messages
 * per cycle), not one message per cycle the way a single-value sensor
 * would -- recording on every message would only cover ~2h in
 * MAX_SAMPLES. The 30s throttle coalesces each minute's burst into
 * roughly one sample, so MAX_SAMPLES covers a full day at the real
 * publish cadence.
 */
const MIN_INTERVAL_MS = 30_000;
const MAX_SAMPLES = 1500;

export interface ConnectivityHistory {
  samples: ConnectivitySample[];
}

export function createConnectivityHistory(): ConnectivityHistory {
  return { samples: [] };
}

export function recordConnectivitySample(
  history: ConnectivityHistory,
  summary: ConnectivitySummary,
  now: number = Date.now(),
): void {
  if (summary.successPct === undefined) {
    return;
  }

  const last = history.samples[history.samples.length - 1];
  if (last && now - last.t < MIN_INTERVAL_MS) {
    return;
  }

  history.samples.push({ t: now, successPct: summary.successPct, avgRttMs: summary.avgRttMs });
  if (history.samples.length > MAX_SAMPLES) {
    history.samples.shift();
  }
}

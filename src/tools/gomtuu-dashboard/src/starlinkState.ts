/**
 * Starlink dish power from `starlink/power_w` (published a few times a
 * second by TheFlea's Starlink collector) and `starlink/availability`.
 */
const PEAK_WINDOW_MS = 2 * 60 * 1000;
/** Readings normally arrive several times a second; this long without one means the feed stopped. */
const STALE_MS = 30 * 1000;

export interface StarlinkStore {
  available?: boolean;
  readings: { t: number; w: number }[];
}

export interface StarlinkSummary {
  powerW?: number;
  /** Highest reading in the last 2 minutes. */
  peakW?: number;
}

export function createStarlinkStore(): StarlinkStore {
  return { readings: [] };
}

export function handleStarlinkMessage(store: StarlinkStore, topic: string, payload: string, now: number = Date.now()): void {
  if (topic === "starlink/availability") {
    const state = payload.trim().toLowerCase();
    store.available = state === "online" ? true : state === "offline" ? false : undefined;
    return;
  }
  if (topic !== "starlink/power_w") return;
  const w = Number(payload);
  if (payload.trim() === "" || !Number.isFinite(w)) return;
  store.readings.push({ t: now, w });
  while (store.readings[0] !== undefined && store.readings[0].t < now - PEAK_WINDOW_MS) store.readings.shift();
}

export function summarizeStarlink(store: StarlinkStore, now: number = Date.now()): StarlinkSummary {
  const latest = store.readings[store.readings.length - 1];
  if (store.available === false || latest === undefined || now - latest.t > STALE_MS) return {};
  const recent = store.readings.filter((r) => r.t >= now - PEAK_WINDOW_MS);
  return { powerW: latest.w, peakW: Math.max(...recent.map((r) => r.w)) };
}

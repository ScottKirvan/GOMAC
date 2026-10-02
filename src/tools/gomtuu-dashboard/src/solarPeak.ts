import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SolarPeakSummary } from "./types.js";

/**
 * Rolling peak solar power over a configurable clock window (default 24h).
 *
 * Tracked server-side as one max-per-minute bucket, so the window length is
 * the only thing that bounds memory (24h = 1,440 buckets, 48h = 2,880) --
 * independent of how fast victron-ble messages arrive. Only the resulting
 * peak goes into /snapshot.json, never the buckets themselves.
 *
 * Buckets are persisted to a small JSON file so a restart (deploy, crash,
 * power cycle) doesn't throw away a day of history.
 */

const BUCKET_MS = 60 * 1000;

interface Bucket {
  /** Start of the minute, epoch ms. */
  t: number;
  maxW: number;
}

export interface SolarPeakStore {
  windowMs: number;
  /** Oldest first. */
  buckets: Bucket[];
  /** Epoch ms of the first reading ever recorded (survives restarts via the state file). */
  firstSeen?: number;
}

export function createSolarPeakStore(windowMs: number): SolarPeakStore {
  return { windowMs, buckets: [] };
}

function prune(store: SolarPeakStore, now: number): void {
  const cutoff = now - store.windowMs;
  let drop = 0;
  for (const b of store.buckets) {
    if (b.t + BUCKET_MS > cutoff) break;
    drop++;
  }
  if (drop > 0) store.buckets.splice(0, drop);
}

export function recordSolarPower(store: SolarPeakStore, watts: number | undefined, now: number = Date.now()): void {
  if (watts === undefined || Number.isNaN(watts)) return;
  const t = now - (now % BUCKET_MS);
  const newest = store.buckets[store.buckets.length - 1];
  if (newest !== undefined && newest.t === t) {
    newest.maxW = Math.max(newest.maxW, watts);
  } else if (newest === undefined || t > newest.t) {
    store.buckets.push({ t, maxW: watts });
  }
  store.firstSeen ??= now;
  prune(store, now);
}

export function summarizeSolarPeak(store: SolarPeakStore, now: number = Date.now()): SolarPeakSummary {
  prune(store, now);
  let peak: Bucket | undefined;
  for (const b of store.buckets) {
    if (peak === undefined || b.maxW > peak.maxW) peak = b;
  }
  // How much of the window actually has data behind it -- right after a
  // first-ever start this ramps up toward windowMs instead of overclaiming.
  const since = store.firstSeen === undefined ? now : Math.max(store.firstSeen, now - store.windowMs);
  return {
    watts: peak?.maxW,
    at: peak?.t,
    windowMs: store.windowMs,
    coveredMs: Math.max(0, now - since),
  };
}

export function loadSolarPeakStore(path: string, windowMs: number, now: number = Date.now()): SolarPeakStore {
  const store = createSolarPeakStore(windowMs);
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<SolarPeakStore>;
    if (Array.isArray(raw.buckets)) {
      store.buckets = raw.buckets
        .filter((b): b is Bucket => typeof b?.t === "number" && typeof b?.maxW === "number")
        .sort((a, b) => a.t - b.t);
    }
    if (typeof raw.firstSeen === "number") store.firstSeen = raw.firstSeen;
  } catch {
    // Missing or unreadable file: start empty. First run, or the file was removed.
  }
  prune(store, now);
  return store;
}

export function saveSolarPeakStore(store: SolarPeakStore, path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify({ firstSeen: store.firstSeen, buckets: store.buckets }));
  renameSync(tmp, path);
}

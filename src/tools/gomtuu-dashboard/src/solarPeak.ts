import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SolarPeakSummary } from "./types.js";

/**
 * Highest solar power ever seen, used as the full-scale reference for the
 * solar ring and the trend chart. Persisted to a small JSON file so it
 * survives restarts; the file can also be hand-seeded with a known
 * historical peak (e.g. from older logs) before first start.
 */
export interface SolarPeakStore {
  watts?: number;
  /** Epoch ms when the peak was recorded. */
  at?: number;
}

export function createSolarPeakStore(): SolarPeakStore {
  return {};
}

/** Returns true when this reading set a new all-time peak. */
export function recordSolarPower(store: SolarPeakStore, watts: number | undefined, now: number = Date.now()): boolean {
  if (watts === undefined || Number.isNaN(watts)) return false;
  if (store.watts !== undefined && watts <= store.watts) return false;
  store.watts = watts;
  store.at = now;
  return true;
}

export function summarizeSolarPeak(store: SolarPeakStore): SolarPeakSummary {
  return { watts: store.watts, at: store.at };
}

export function loadSolarPeakStore(path: string): SolarPeakStore {
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<SolarPeakStore>;
    if (typeof raw.watts === "number" && !Number.isNaN(raw.watts)) {
      return { watts: raw.watts, at: typeof raw.at === "number" ? raw.at : undefined };
    }
  } catch {
    // Missing or unreadable file: start with no peak.
  }
  return createSolarPeakStore();
}

export function saveSolarPeakStore(store: SolarPeakStore, path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify({ watts: store.watts, at: store.at }));
  renameSync(tmp, path);
}

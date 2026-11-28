/**
 * Browser-side persistence for the most recent dashboard snapshot so the UI can
 * still display the last recorded telemetry when Gomtuu is offline.
 */

export const SNAPSHOT_CACHE_KEY = "gomac.dashboard.lastSnapshot.v1";

function defaultStorage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : undefined;
  } catch {
    return undefined;
  }
}

export function saveCachedSnapshot(snapshot, locationInfo = undefined, savedAt = Date.now(), storage = defaultStorage()) {
  if (!storage || !snapshot || typeof snapshot !== "object") return false;
  try {
    const payload = {
      v: 1,
      savedAt,
      snapshot,
      ...(locationInfo ? { locationInfo } : {}),
    };
    storage.setItem(SNAPSHOT_CACHE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    // Storage unavailable or quota exceeded: dashboard continues without caching.
    return false;
  }
}

export function loadCachedSnapshot(storage = defaultStorage()) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SNAPSHOT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.v !== 1 || !parsed.snapshot || typeof parsed.snapshot !== "object") return null;
    const savedAt = typeof parsed.savedAt === "number" && Number.isFinite(parsed.savedAt) ? parsed.savedAt : undefined;
    return {
      snapshot: parsed.snapshot,
      locationInfo: parsed.locationInfo && typeof parsed.locationInfo === "object" ? parsed.locationInfo : undefined,
      savedAt,
    };
  } catch {
    return null;
  }
}

export function clearCachedSnapshot(storage = defaultStorage()) {
  if (!storage) return;
  try {
    storage.removeItem(SNAPSHOT_CACHE_KEY);
  } catch {
    // Ignore storage errors.
  }
}

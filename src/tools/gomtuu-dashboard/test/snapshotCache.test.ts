import { describe, expect, it } from "vitest";
import {
  SNAPSHOT_CACHE_KEY,
  clearCachedSnapshot,
  loadCachedSnapshot,
  saveCachedSnapshot,
} from "../public/snapshotCache.js";

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  };
}

describe("snapshotCache", () => {
  const sampleSnapshot = {
    serverTime: 1795811400000,
    victron: { devices: {}, power: { soc: 88 } },
    nowPlaying: {},
    position: { latitude: 39.9, longitude: -75.2, coarse: true },
    weather: { temperatureC: 11 },
    connectivity: { targets: {}, summary: {}, history: [] },
  };
  const sampleLocation = { label: "Near Philadelphia, PA", timezone: "America/New_York", timezoneAbbreviation: "EST" };

  it("saves and loads a snapshot with locationInfo and savedAt", () => {
    const storage = memoryStorage();
    const ok = saveCachedSnapshot(sampleSnapshot, sampleLocation, 1795811400000, storage);
    expect(ok).toBe(true);

    const loaded = loadCachedSnapshot(storage);
    expect(loaded).toEqual({
      snapshot: sampleSnapshot,
      locationInfo: sampleLocation,
      savedAt: 1795811400000,
    });
  });

  it("returns null for empty, corrupt, or wrong-version storage entries", () => {
    const storage = memoryStorage();
    expect(loadCachedSnapshot(storage)).toBeNull();

    storage.setItem(SNAPSHOT_CACHE_KEY, "{not valid json");
    expect(loadCachedSnapshot(storage)).toBeNull();

    storage.setItem(SNAPSHOT_CACHE_KEY, JSON.stringify({ v: 99, snapshot: sampleSnapshot }));
    expect(loadCachedSnapshot(storage)).toBeNull();
  });

  it("clears cached snapshots", () => {
    const storage = memoryStorage();
    saveCachedSnapshot(sampleSnapshot, undefined, 1000, storage);
    expect(loadCachedSnapshot(storage)).not.toBeNull();
    clearCachedSnapshot(storage);
    expect(loadCachedSnapshot(storage)).toBeNull();
  });

  it("handles storage errors (quota exceeded / private mode) without throwing", () => {
    const throwingStorage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(saveCachedSnapshot(sampleSnapshot, undefined, 1000, throwingStorage)).toBe(false);
    expect(loadCachedSnapshot(throwingStorage)).toBeNull();
    expect(() => clearCachedSnapshot(throwingStorage)).not.toThrow();
  });
});

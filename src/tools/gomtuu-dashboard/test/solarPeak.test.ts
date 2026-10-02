import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createSolarPeakStore,
  loadSolarPeakStore,
  recordSolarPower,
  saveSolarPeakStore,
  summarizeSolarPeak,
} from "../src/solarPeak.js";

const HOUR = 60 * 60 * 1000;
const BASE = 1_699_999_980_000; // minute-aligned

describe("solar peak", () => {
  it("reports nothing before any reading", () => {
    const store = createSolarPeakStore(24 * HOUR);
    expect(summarizeSolarPeak(store, BASE)).toEqual({ watts: undefined, at: undefined, windowMs: 24 * HOUR, coveredMs: 0 });
  });

  it("ignores undefined readings", () => {
    const store = createSolarPeakStore(24 * HOUR);
    recordSolarPower(store, undefined, BASE);
    expect(store.buckets).toHaveLength(0);
  });

  it("finds the peak across a full 48h window at ~12 msgs/s with one bucket per minute", () => {
    const store = createSolarPeakStore(48 * HOUR);
    const spike = (t: number, at: number) => t >= at && t < at + 83;
    for (let t = BASE; t < BASE + 50 * HOUR; t += 83) {
      // 999W spike at +1h ages out of the 48h window by the end; 180W at +20h doesn't
      const watts = spike(t, BASE + 1 * HOUR) ? 999 : spike(t, BASE + 20 * HOUR) ? 180 : 50;
      recordSolarPower(store, watts, t);
    }
    const now = BASE + 50 * HOUR;
    expect(store.buckets.length).toBeLessThanOrEqual(48 * 60 + 1);
    const s = summarizeSolarPeak(store, now);
    expect(s.watts).toBe(180);
    expect(s.at).toBe(BASE + 20 * HOUR);
    expect(s.coveredMs).toBe(48 * HOUR);
  });

  it("ages a peak out once it leaves the window", () => {
    const store = createSolarPeakStore(24 * HOUR);
    recordSolarPower(store, 200, BASE);
    recordSolarPower(store, 40, BASE + 23 * HOUR);
    expect(summarizeSolarPeak(store, BASE + 23 * HOUR).watts).toBe(200);
    expect(summarizeSolarPeak(store, BASE + 24 * HOUR + 60 * 1000).watts).toBe(40);
  });

  it("reports partial coverage right after a first-ever start", () => {
    const store = createSolarPeakStore(24 * HOUR);
    recordSolarPower(store, 10, BASE);
    expect(summarizeSolarPeak(store, BASE + 2 * HOUR).coveredMs).toBe(2 * HOUR);
  });

  it("survives a save/load round trip, pruning stale buckets on load", () => {
    const dir = mkdtempSync(join(tmpdir(), "solarpeak-"));
    try {
      const path = join(dir, "nested", "solar-peak.json");
      const store = createSolarPeakStore(24 * HOUR);
      recordSolarPower(store, 300, BASE);
      recordSolarPower(store, 120, BASE + 10 * HOUR);
      saveSolarPeakStore(store, path);

      const reloaded = loadSolarPeakStore(path, 24 * HOUR, BASE + 12 * HOUR);
      expect(summarizeSolarPeak(reloaded, BASE + 12 * HOUR)).toMatchObject({ watts: 300, coveredMs: 12 * HOUR });

      const later = loadSolarPeakStore(path, 24 * HOUR, BASE + 30 * HOUR);
      expect(summarizeSolarPeak(later, BASE + 30 * HOUR).watts).toBe(120);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("starts empty when the state file is missing or corrupt", () => {
    const store = loadSolarPeakStore("/nonexistent/solar-peak.json", 24 * HOUR, BASE);
    expect(store.buckets).toHaveLength(0);
  });
});

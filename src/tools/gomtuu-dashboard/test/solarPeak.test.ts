import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

describe("solar peak", () => {
  it("reports nothing before any reading", () => {
    expect(summarizeSolarPeak(createSolarPeakStore())).toEqual({ watts: undefined, at: undefined });
  });

  it("ignores undefined and NaN readings", () => {
    const store = createSolarPeakStore();
    expect(recordSolarPower(store, undefined, 1)).toBe(false);
    expect(recordSolarPower(store, Number.NaN, 2)).toBe(false);
    expect(store.watts).toBeUndefined();
  });

  it("keeps only the highest reading ever seen, and reports when it changes", () => {
    const store = createSolarPeakStore();
    expect(recordSolarPower(store, 80, 1000)).toBe(true);
    expect(recordSolarPower(store, 210, 2000)).toBe(true);
    expect(recordSolarPower(store, 150, 3000)).toBe(false);
    expect(recordSolarPower(store, 210, 4000)).toBe(false);
    expect(summarizeSolarPeak(store)).toEqual({ watts: 210, at: 2000 });
  });

  it("survives a save/load round trip", () => {
    const dir = mkdtempSync(join(tmpdir(), "solarpeak-"));
    try {
      const path = join(dir, "nested", "solar-peak.json");
      const store = createSolarPeakStore();
      recordSolarPower(store, 231, 5000);
      saveSolarPeakStore(store, path);
      expect(loadSolarPeakStore(path)).toEqual({ watts: 231, at: 5000 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts a hand-seeded file without a timestamp", () => {
    const dir = mkdtempSync(join(tmpdir(), "solarpeak-"));
    try {
      const path = join(dir, "solar-peak.json");
      writeFileSync(path, JSON.stringify({ watts: 231 }));
      expect(loadSolarPeakStore(path)).toEqual({ watts: 231, at: undefined });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("starts empty when the state file is missing or corrupt", () => {
    expect(loadSolarPeakStore("/nonexistent/solar-peak.json")).toEqual({});
  });
});

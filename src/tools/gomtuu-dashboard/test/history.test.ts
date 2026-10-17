import { describe, expect, it } from "vitest";
import { createPowerHistory, loadPowerHistory, recordPowerSample, savePowerHistory } from "../src/history.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("recordPowerSample", () => {
  it("ignores a summary with no voltage, soc, or solarPower", () => {
    const history = createPowerHistory();
    recordPowerSample(history, {}, 1000);
    expect(history.samples).toHaveLength(0);
  });

  it("keeps 48 hours of samples and prunes older ones", () => {
    const history = createPowerHistory();
    const base = 1_000_000;
    const HOUR = 60 * 60 * 1000;
    for (let h = 0; h <= 50; h++) recordPowerSample(history, { soc: 50 }, base + h * HOUR);
    const now = base + 50 * HOUR;
    expect(now - history.samples[0]!.t).toBe(48 * HOUR);
  });

  it("keeps a full day at real-world rates within 10s buckets", () => {
    const history = createPowerHistory();
    const base = 1_000_000;
    const end = base + 24 * 60 * 60 * 1000;
    for (let t = base; t <= end; t += 1000) recordPowerSample(history, { soc: 50 }, t);
    expect(history.samples.length).toBeLessThanOrEqual(24 * 360 + 1);
  });

  it("merges readings within a 10s bucket, keeping the max solarPower", () => {
    const history = createPowerHistory();
    const base = 1_000_000;
    recordPowerSample(history, { solarPower: 40, voltage: 13.1 }, base);
    recordPowerSample(history, { solarPower: 95 }, base + 3000);
    recordPowerSample(history, { solarPower: 20, voltage: 13.3 }, base + 6000);
    expect(history.samples).toHaveLength(1);
    expect(history.samples[0]).toMatchObject({ t: base, solarPower: 95, voltage: 13.3 });

    recordPowerSample(history, { solarPower: 10 }, base + 10_000);
    expect(history.samples).toHaveLength(2);
  });
});

describe("energy charged into the battery", () => {
  it("counts elapsed time at the latest battery power, whichever device's message arrives", () => {
    const history = createPowerHistory();
    const base = 1_000_000;
    // Steady 100 W of charging: the shunt publishes only on change, so only
    // other devices' messages arrive while it holds steady.
    recordPowerSample(history, { soc: 50, power: 100 }, base);
    for (let i = 1; i <= 9; i++) recordPowerSample(history, { soc: 50, power: 100, solarPower: 120 + i }, base + i * 1000);
    // 9 seconds at 100 W = 900 J = 0.25 Wh.
    expect(history.samples[0]!.chargedWh).toBeCloseTo(0.25, 6);
  });

  it("ignores drawing: only charging counts", () => {
    const history = createPowerHistory();
    const base = 1_000_000;
    for (let i = 0; i < 5; i++) recordPowerSample(history, { soc: 50, power: -80 }, base + i * 1000);
    expect(history.samples[0]!.chargedWh ?? 0).toBe(0);
  });

  it("doesn't count time while the battery monitor is offline", () => {
    const history = createPowerHistory();
    const base = 1_000_000;
    recordPowerSample(history, { soc: 50, power: 200, batteryOnline: false }, base);
    recordPowerSample(history, { soc: 50, power: 200, batteryOnline: false }, base + 5000);
    expect(history.samples[0]!.chargedWh ?? 0).toBe(0);
    recordPowerSample(history, { soc: 50, power: 200, batteryOnline: true }, base + 6000);
    recordPowerSample(history, { soc: 50, power: 200, batteryOnline: true }, base + 7000);
    // Only the last second, after it came back online: 200 J.
    expect(history.samples[0]!.chargedWh).toBeCloseTo(200 / 3600, 6);
  });

  it("doesn't count across a gap of more than 60 seconds with no messages at all", () => {
    const history = createPowerHistory();
    const base = 1_000_000;
    recordPowerSample(history, { soc: 50, power: 500 }, base);
    recordPowerSample(history, { soc: 50, power: 500 }, base + 61_000);
    const total = history.samples.reduce((sum, s) => sum + (s.chargedWh ?? 0), 0);
    expect(total).toBe(0);
  });
});

describe("loadPowerHistory / savePowerHistory", () => {
  it("round-trips samples through a file and drops ones older than 48 hours", () => {
    const dir = mkdtempSync(join(tmpdir(), "gomac-history-"));
    const path = join(dir, "nested", "power-history.json");
    const now = 10 * 24 * 60 * 60 * 1000;
    const history = createPowerHistory();
    history.samples.push({ t: now - 49 * 60 * 60 * 1000, soc: 40 }, { t: now - 1000, soc: 60, chargedWh: 1.5 });
    savePowerHistory(history, path);
    const loaded = loadPowerHistory(path, now);
    expect(loaded.samples).toEqual([{ t: now - 1000, soc: 60, chargedWh: 1.5 }]);
  });

  it("starts empty from a missing or corrupt file", () => {
    const dir = mkdtempSync(join(tmpdir(), "gomac-history-"));
    expect(loadPowerHistory(join(dir, "missing.json")).samples).toEqual([]);
    const corrupt = join(dir, "corrupt.json");
    writeFileSync(corrupt, "{not json");
    expect(loadPowerHistory(corrupt).samples).toEqual([]);
  });
});

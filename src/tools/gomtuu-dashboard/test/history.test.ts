import { describe, expect, it } from "vitest";
import { createPowerHistory, recordPowerSample } from "../src/history.js";

describe("recordPowerSample", () => {
  it("ignores a summary with no voltage, soc, or solarPower", () => {
    const history = createPowerHistory();
    recordPowerSample(history, {}, 1000);
    expect(history.samples).toHaveLength(0);
  });

  it("keeps samples within the 1-hour peak window", () => {
    const history = createPowerHistory();
    const base = 1_000_000;
    recordPowerSample(history, { soc: 50 }, base);
    recordPowerSample(history, { soc: 51 }, base + 30 * 60 * 1000); // +30 min
    expect(history.samples).toHaveLength(2);
  });

  it("prunes samples older than the 1-hour window regardless of count", () => {
    const history = createPowerHistory();
    const base = 1_000_000;
    // one message per second for 90 minutes straight
    for (let i = 0; i <= 90 * 60; i++) {
      recordPowerSample(history, { soc: 50 }, base + i * 1000);
    }
    const now = base + 90 * 60 * 1000;
    const oldestAge = now - history.samples[0].t;
    expect(oldestAge).toBeLessThanOrEqual(60 * 60 * 1000);
    // still covers (nearly) the full hour, not cut short by the sample cap
    expect(oldestAge).toBeGreaterThan(59 * 60 * 1000);
  });

  it("covers the full hour at real-world message rates (~12/s)", () => {
    const history = createPowerHistory();
    const base = 1_000_000;
    const end = base + 70 * 60 * 1000;
    for (let t = base; t <= end; t += 83) {
      recordPowerSample(history, { soc: 50 }, t);
    }
    expect(end - history.samples[0].t).toBeGreaterThan(59 * 60 * 1000);
    expect(history.samples.length).toBeLessThanOrEqual(400);
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

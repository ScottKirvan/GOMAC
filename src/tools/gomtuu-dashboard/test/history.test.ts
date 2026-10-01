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
    recordPowerSample(history, { soc: 50 }, base);
    // same device publishing every second for 90 minutes straight -- many
    // more than 500 samples, which the old count-based ring buffer would
    // have evicted the earliest ones purely on count, not age.
    for (let i = 1; i <= 90 * 60; i++) {
      recordPowerSample(history, { soc: 50 }, base + i * 1000);
    }
    const now = base + 90 * 60 * 1000;
    const oldestAge = now - history.samples[0].t;
    expect(oldestAge).toBeLessThanOrEqual(60 * 60 * 1000);
    expect(history.samples.length).toBeGreaterThan(500);
  });
});

import { describe, expect, it } from "vitest";
import { createStarlinkStore, handleStarlinkMessage, summarizeStarlink } from "../src/starlinkState.js";

describe("starlink power", () => {
  it("reports the latest power and the peak over the last 2 minutes", () => {
    const store = createStarlinkStore();
    const base = 1_000_000;
    handleStarlinkMessage(store, "starlink/power_w", "41.0", base);
    handleStarlinkMessage(store, "starlink/power_w", "22.5", base + 60_000);
    handleStarlinkMessage(store, "starlink/power_w", "19.2", base + 100_000);
    expect(summarizeStarlink(store, base + 100_000)).toEqual({ powerW: 19.2, peakW: 41 });
    // The 41 W reading is now more than 2 minutes old.
    handleStarlinkMessage(store, "starlink/power_w", "18.0", base + 125_000);
    expect(summarizeStarlink(store, base + 125_000)).toEqual({ powerW: 18, peakW: 22.5 });
  });

  it("reports nothing while the dish is offline or its readings have stopped", () => {
    const store = createStarlinkStore();
    handleStarlinkMessage(store, "starlink/power_w", "25", 1000);
    handleStarlinkMessage(store, "starlink/availability", "offline", 1000);
    expect(summarizeStarlink(store, 1000)).toEqual({});
    handleStarlinkMessage(store, "starlink/availability", "online", 2000);
    expect(summarizeStarlink(store, 2000)).toEqual({ powerW: 25, peakW: 25 });
    expect(summarizeStarlink(store, 1000 + 31_000)).toEqual({});
  });

  it("ignores other topics and unreadable payloads", () => {
    const store = createStarlinkStore();
    handleStarlinkMessage(store, "starlink/power_w", "n/a", 1000);
    handleStarlinkMessage(store, "starlink/latency_ms", "30", 1000);
    expect(summarizeStarlink(store, 1000)).toEqual({});
  });
});

import { describe, expect, it } from "vitest";
import { redactPositionForPublic } from "../src/dashboardState.js";
import type { DashboardSnapshot } from "../src/types.js";

function fixtureSnapshot(): DashboardSnapshot {
  return {
    victron: {
      devices: {},
      power: {},
      chart: { start: 0, end: 0, samples: [] },
      solarPeak: {},
      flows: { solarW: 0, shoreW: 0, starlinkW: 0, loadW: 0, ghostEstimated: false },
    },
    nowPlaying: {},
    position: { latitude: 44.37, longitude: -64.32, accuracyM: 10, speedMps: 5 },
    weather: {
      temperatureC: 18,
      condition: "clear",
      sourceLatitude: 44.37,
      sourceLongitude: -64.32,
    },
    connectivity: { targets: {}, summary: {}, history: [] },
    serverTime: 1700000000000,
  };
}

describe("redactPositionForPublic", () => {
  it("coarsens position: coordinates to 1 decimal place, speed and heading to whole numbers, no accuracy or altitude", () => {
    const snapshot = fixtureSnapshot();
    snapshot.position = {
      latitude: 44.3712,
      longitude: -64.3268,
      accuracyM: 10,
      altitudeM: 37.4,
      speedMps: 5.38,
      courseDeg: 271.6,
      updatedAt: 1700000000000,
    };
    const result = redactPositionForPublic(snapshot);
    expect(result.position).toEqual({
      latitude: 44.4,
      longitude: -64.3,
      speedMps: 5,
      courseDeg: 272,
      updatedAt: 1700000000000,
      coarse: true,
    });
  });

  it("leaves an empty position empty rather than marking it coarse", () => {
    const snapshot = fixtureSnapshot();
    snapshot.position = {};
    expect(redactPositionForPublic(snapshot).position).toEqual({});
  });

  it("strips the source coordinates weather was fetched with, since they leak the same location", () => {
    const result = redactPositionForPublic(fixtureSnapshot());
    expect(result.weather.sourceLatitude).toBeUndefined();
    expect(result.weather.sourceLongitude).toBeUndefined();
  });

  it("keeps the rest of the weather data intact", () => {
    const result = redactPositionForPublic(fixtureSnapshot());
    expect(result.weather.temperatureC).toBe(18);
    expect(result.weather.condition).toBe("clear");
  });

  it("leaves every other section of the snapshot untouched", () => {
    const original = fixtureSnapshot();
    const result = redactPositionForPublic(original);
    expect(result.victron).toBe(original.victron);
    expect(result.nowPlaying).toBe(original.nowPlaying);
    expect(result.connectivity).toBe(original.connectivity);
    expect(result.serverTime).toBe(original.serverTime);
  });

  it("does not mutate the original snapshot", () => {
    const original = fixtureSnapshot();
    redactPositionForPublic(original);
    expect(original.position.latitude).toBe(44.37);
    expect(original.weather.sourceLatitude).toBe(44.37);
  });
});

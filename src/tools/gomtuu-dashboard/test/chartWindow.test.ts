import { describe, expect, it } from "vitest";
import { chartSamples, chartWindow, localTimeToEpoch } from "../src/chartWindow.js";
import type { PowerSample, WeatherState } from "../src/types.js";

const HOUR = 60 * 60 * 1000;
// PDT, UTC-7.
const weather: WeatherState = {
  yesterdaySunrise: "2026-10-16T07:27",
  yesterdaySunset: "2026-10-16T18:24",
  sunrise: "2026-10-17T07:28",
  sunset: "2026-10-17T18:22",
  utcOffsetSeconds: -7 * 3600,
};
const at = (utc: string) => Date.parse(utc);

describe("localTimeToEpoch", () => {
  it("converts a naive local time using the location's UTC offset", () => {
    expect(localTimeToEpoch("2026-10-17T07:28", -7 * 3600)).toBe(at("2026-10-17T14:28:00Z"));
  });
});

describe("chartWindow", () => {
  it("runs from an hour before sunrise to now during the day", () => {
    const now = at("2026-10-17T20:00:00Z"); // 13:00 local
    expect(chartWindow(weather, now)).toEqual({ start: at("2026-10-17T13:28:00Z"), end: now });
  });

  it("stops growing an hour after sunset", () => {
    const now = at("2026-10-18T04:00:00Z"); // 21:00 local
    expect(chartWindow(weather, now)).toEqual({ start: at("2026-10-17T13:28:00Z"), end: at("2026-10-18T02:22:00Z") });
  });

  it("shows the previous day's window until an hour before today's sunrise", () => {
    const now = at("2026-10-17T13:00:00Z"); // 06:00 local
    expect(chartWindow(weather, now)).toEqual({ start: at("2026-10-16T13:27:00Z"), end: at("2026-10-17T02:24:00Z") });
  });

  it("falls back to the last 12 hours without sun times", () => {
    const now = at("2026-10-17T20:00:00Z");
    expect(chartWindow({}, now)).toEqual({ start: now - 12 * HOUR, end: now });
  });
});

describe("chartSamples", () => {
  it("merges the window's 10s buckets into 1-minute points: peak solar, summed energy", () => {
    const start = 1_000_000_020_000;
    const samples: PowerSample[] = [
      { t: start - 10_000, solarPower: 999, chargedWh: 5 }, // before the window
      { t: start, solarPower: 40, chargedWh: 0.1 },
      { t: start + 10_000, solarPower: 90, chargedWh: 0.2 },
      { t: start + 60_000, solarPower: 30 },
      { t: start + 70_000, chargedWh: 0.05 },
    ];
    const points = chartSamples(samples, start, start + 2 * 60_000);
    expect(points.map((p) => [p.t, p.solarPower])).toEqual([[start, 90], [start + 60_000, 30]]);
    expect(points[0]!.chargedWh).toBeCloseTo(0.3, 9);
    expect(points[1]!.chargedWh).toBeCloseTo(0.05, 9);
  });
});

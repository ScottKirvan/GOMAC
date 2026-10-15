import { describe, expect, it } from "vitest";
import {
  buildChartSvg,
  compassLabel,
  describeArcFromTop,
  fmt,
  fmtSigned,
  formatClock,
  formatDuration,
} from "../public/render.js";

describe("fmt / fmtSigned", () => {
  it("renders an em dash for missing values", () => {
    expect(fmt(undefined, 1, " V")).toBe("—");
    expect(fmtSigned(Number.NaN, 1, " A")).toBe("—");
  });

  it("prefixes positive values with + only in fmtSigned", () => {
    expect(fmt(4.25, 1, " A")).toBe("4.3 A");
    expect(fmtSigned(4.25, 1, " A")).toBe("+4.3 A");
    expect(fmtSigned(-4.25, 1, " A")).toBe("-4.3 A");
  });
});

describe("formatDuration / formatClock", () => {
  it("formats durations at second, minute, and hour scale", () => {
    expect(formatDuration(42_000)).toBe("42s");
    expect(formatDuration(5 * 60_000)).toBe("5m");
    expect(formatDuration(90 * 60_000)).toBe("1.5h");
  });

  it("formats a song clock as m:ss", () => {
    expect(formatClock(65_000)).toBe("1:05");
    expect(formatClock(undefined)).toBe("--:--");
  });
});

describe("compassLabel", () => {
  it("maps degrees to the nearest of 8 compass points", () => {
    expect(compassLabel(0)).toBe("N");
    expect(compassLabel(359)).toBe("N");
    expect(compassLabel(135)).toBe("SE");
    expect(compassLabel(-90)).toBe("W");
  });
});

describe("describeArcFromTop", () => {
  it("returns an empty path for a zero extent", () => {
    expect(describeArcFromTop(64, 64, 58, 0)).toBe("");
  });

  it("sweeps clockwise for positive and counter-clockwise for negative extents", () => {
    expect(describeArcFromTop(64, 64, 58, 90)).toMatch(/ 0 0 1 /);
    expect(describeArcFromTop(64, 64, 58, -90)).toMatch(/ 0 0 0 /);
  });
});

describe("buildChartSvg", () => {
  it("returns undefined until there are at least two samples", () => {
    expect(buildChartSvg([{ t: 0, solarPower: 10 }], 100)).toBeUndefined();
  });
});

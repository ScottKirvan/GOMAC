import { describe, expect, it } from "vitest";
import {
  buildChartSvg,
  compassLabel,
  describeArcFromTop,
  fmt,
  fmtSigned,
  formatClock,
  formatDuration,
  googleMapsUrl,
  currentDirection,
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

// .chart-endlabel is 11px IBM Plex Mono; monospace glyphs advance 0.6em.
const END_LABEL_CHAR_WIDTH = 11 * 0.6;
const END_LABEL_FONT_SIZE = 11;

function endLabels(svg: string): { x: number; y: number; text: string }[] {
  const viewBoxWidth = Number(/viewBox="0 0 (\d+) /.exec(svg)?.[1]);
  expect(viewBoxWidth).toBeGreaterThan(0);
  return [...svg.matchAll(/<text class="chart-endlabel" x="([\d.-]+)" y="([\d.-]+)"[^>]*>([^<]*)<\/text>/g)].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2]),
    text: m[3] ?? "",
  }));
}

describe("buildChartSvg", () => {
  it("returns undefined until there are at least two samples", () => {
    expect(buildChartSvg([{ t: 0, solarPower: 10 }], 100)).toBeUndefined();
  });

  it("keeps the end-of-line value labels inside the viewBox", () => {
    const svg = buildChartSvg(
      [
        { t: 0, solarPower: 120, power: -1250 },
        { t: 60_000, solarPower: 238, power: -1180 },
      ],
      238,
    );
    expect(svg).toBeDefined();
    const viewBoxWidth = Number(/viewBox="0 0 (\d+) /.exec(svg!)?.[1]);
    const labels = endLabels(svg!);
    expect(labels).toHaveLength(2);
    for (const label of labels) {
      expect(label.x + label.text.length * END_LABEL_CHAR_WIDTH).toBeLessThanOrEqual(viewBoxWidth);
    }
  });

  it("separates the two end labels when the lines finish at nearly the same value", () => {
    const svg = buildChartSvg(
      [
        { t: 0, solarPower: 50, power: 48 },
        { t: 60_000, solarPower: 60, power: 59 },
      ],
      238,
    );
    const [a, b] = endLabels(svg!);
    expect(Math.abs(a!.y - b!.y)).toBeGreaterThanOrEqual(END_LABEL_FONT_SIZE);
  });
});

describe("googleMapsUrl", () => {
  it("builds a Google Maps search URL centered on the coordinates", () => {
    expect(googleMapsUrl(44.05207, -123.08675)).toBe(
      "https://www.google.com/maps/search/?api=1&query=44.05207%2C-123.08675",
    );
  });

  it("returns undefined without a full fix", () => {
    expect(googleMapsUrl(undefined, -123.1)).toBeUndefined();
    expect(googleMapsUrl(44.1, undefined)).toBeUndefined();
  });
});

describe("currentDirection", () => {
  it("classifies signed battery current as charge or draw", () => {
    expect(currentDirection(4.3)).toBe("charge");
    expect(currentDirection(-1.2)).toBe("draw");
  });

  it("is undefined for zero or missing current", () => {
    expect(currentDirection(0)).toBeUndefined();
    expect(currentDirection(undefined)).toBeUndefined();
    expect(currentDirection(Number.NaN)).toBeUndefined();
  });
});

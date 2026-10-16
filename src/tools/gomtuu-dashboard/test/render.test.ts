import { describe, expect, it } from "vitest";
import {
  buildChartSvg,
  compassLabel,
  fmt,
  fmtSigned,
  formatClock,
  formatDuration,
  googleMapsUrl,
  currentDirection,
  chargeStateTone,
  weatherIcon,
  forecastDayLabel,
  gradientArcSvg,
  escapeHtml,
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

describe("chargeStateTone", () => {
  it("gives bulk, absorption, and float each their own charging tone", () => {
    expect(chargeStateTone("BULK")).toBe("bulk");
    expect(chargeStateTone("ABSORPTION")).toBe("absorption");
    expect(chargeStateTone("FLOAT")).toBe("float");
  });

  it("groups absorption-like stages with absorption", () => {
    expect(chargeStateTone("REPEATED_ABSORPTION")).toBe("absorption");
    expect(chargeStateTone("EQUALIZE_MANUAL")).toBe("absorption");
    expect(chargeStateTone("RECONDITION")).toBe("absorption");
  });

  it("marks storage as resting, fault as fault, and off-like states as off", () => {
    expect(chargeStateTone("STORAGE")).toBe("storage");
    expect(chargeStateTone("FAULT")).toBe("fault");
    expect(chargeStateTone("OFF")).toBe("off");
    expect(chargeStateTone("LOW_POWER")).toBe("off");
    expect(chargeStateTone("NOT_AVAILABLE")).toBe("off");
  });

  it("is case-insensitive and falls back to neutral for anything unrecognized", () => {
    expect(chargeStateTone("bulk")).toBe("bulk");
    expect(chargeStateTone("INVERTING")).toBe("neutral");
    expect(chargeStateTone("SOMETHING_NEW")).toBe("neutral");
    expect(chargeStateTone(undefined)).toBeUndefined();
  });
});

describe("weatherIcon", () => {
  it("maps WMO code groups to an icon", () => {
    expect(weatherIcon(0)).toBe("☀️");
    expect(weatherIcon(2)).toBe("⛅");
    expect(weatherIcon(3)).toBe("☁️");
    expect(weatherIcon(45)).toBe("🌫️");
    expect(weatherIcon(55)).toBe("🌦️");
    expect(weatherIcon(63)).toBe("🌧️");
    expect(weatherIcon(73)).toBe("🌨️");
    expect(weatherIcon(95)).toBe("⛈️");
  });

  it("is empty for missing or unknown codes", () => {
    expect(weatherIcon(undefined)).toBe("");
    expect(weatherIcon(12345)).toBe("");
  });
});

describe("forecastDayLabel", () => {
  it("labels the first day Today and the rest by local weekday", () => {
    expect(forecastDayLabel("2026-10-15", 0)).toBe("Today");
    // 2026-10-16 is a Friday; parsed as a local date, not UTC midnight.
    expect(forecastDayLabel("2026-10-16", 1)).toBe("Fri");
  });
});

describe("gradientArcSvg", () => {
  const base = { cx: 64, cy: 64, r: 47, strokeWidth: 7, start: "#000000", end: "#ffffff" };

  it("draws nothing for an empty or zero-extent arc", () => {
    expect(gradientArcSvg({ ...base, extentDeg: 0 })).toBe("");
  });

  it("runs the gradient from the start color at 12 o'clock to the end color at the tip", () => {
    const svg = gradientArcSvg({ ...base, extentDeg: 90 });
    const caps = [...svg.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)" r="3.5" fill="(#[0-9a-f]{6})"/g)];
    expect(caps).toHaveLength(2);
    expect(Number(caps[0]![1])).toBeCloseTo(64, 3);
    expect(Number(caps[0]![2])).toBeCloseTo(17, 3);
    expect(caps[0]![3]).toBe("#000000");
    // Even a short arc spans the whole gradient: the tip is the end color.
    expect(caps[1]![3]).toBe("#ffffff");
  });

  it("sweeps counter-clockwise for negative extents", () => {
    const svg = gradientArcSvg({ ...base, extentDeg: -90 });
    const caps = [...svg.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)"/g)];
    // Tip at 9 o'clock.
    expect(Number(caps[1]![1])).toBeCloseTo(17, 3);
    expect(Number(caps[1]![2])).toBeCloseTo(64, 3);
    expect(svg).toMatch(/ 0 0 0 /);
  });
});

describe("escapeHtml", () => {
  it("escapes markup-significant characters", () => {
    expect(escapeHtml(`<b>"Van" & 'co'</b>`)).toBe("&lt;b&gt;&quot;Van&quot; &amp; &#39;co&#39;&lt;/b&gt;");
  });

  it("passes plain names through unchanged", () => {
    expect(escapeHtml("BSC IP22 12/15...HQ24237J9QY")).toBe("BSC IP22 12/15...HQ24237J9QY");
  });
});

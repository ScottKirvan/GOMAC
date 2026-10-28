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
  easeToward,
  easeAngleToward,
  lockIconSvg,
  deviceCardHtml,
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
  const start = Date.parse("2026-10-17T13:28:00Z");
  const minute = 60_000;
  const chart = (samples: { t: number; solarPower?: number; chargedWh?: number }[], end = start + 120 * minute) => ({
    start,
    end,
    samples,
  });

  it("returns undefined until there are at least two points", () => {
    expect(buildChartSvg(chart([{ t: start, solarPower: 10 }]), 100, start)).toBeUndefined();
  });

  it("keeps the end-of-line value labels inside the viewBox", () => {
    const svg = buildChartSvg(
      chart([
        { t: start, solarPower: 120, chargedWh: 400 },
        { t: start + 60 * minute, solarPower: 238, chargedWh: 900 },
      ]),
      238,
      start + 120 * minute,
    );
    const viewBoxWidth = Number(/viewBox="0 0 (\d+) /.exec(svg!)?.[1]);
    const labels = endLabels(svg!);
    expect(labels).toHaveLength(2);
    for (const label of labels) {
      expect(label.x + label.text.length * END_LABEL_CHAR_WIDTH).toBeLessThanOrEqual(viewBoxWidth);
    }
  });

  it("separates the two end labels when the lines finish close together", () => {
    // Banked ends at 80% of its scale (scale headroom is 1.25x); solar at 80% of 238W.
    const svg = buildChartSvg(
      chart([
        { t: start, solarPower: 0, chargedWh: 0 },
        { t: start + 60 * minute, solarPower: 0.8 * 238 / 1.1, chargedWh: 100 },
      ]),
      238,
      start + 120 * minute,
    );
    const [a, b] = endLabels(svg!);
    expect(Math.abs(a!.y - b!.y)).toBeGreaterThanOrEqual(END_LABEL_FONT_SIZE);
  });

  it("keeps a multi-kWh banked label inside the viewBox, shown in kWh", () => {
    const svg = buildChartSvg(chart([{ t: start, solarPower: 10, chargedWh: 1500 }, { t: start + minute, solarPower: 20, chargedWh: 1575 }]), 238, start + minute);
    const label = endLabels(svg!).find((l) => l.text.endsWith("kWh"))!;
    expect(label.text).toBe("3.08 kWh");
    expect(label.x + label.text.length * END_LABEL_CHAR_WIDTH).toBeLessThanOrEqual(600);
  });

  it("plots energy banked as a running total of charging since the window start", () => {
    const svg = buildChartSvg(
      chart([
        { t: start, solarPower: 50, chargedWh: 1.5 },
        { t: start + minute, solarPower: 60 },
        { t: start + 2 * minute, solarPower: 70, chargedWh: 2 },
      ]),
      238,
      start + 2 * minute,
    );
    const labels = endLabels(svg!).map((l) => l.text);
    expect(labels).toContain("4 Wh");
    expect(labels).toContain("70W");
  });

  it("labels the axis with the window's clock times, and 'now' while it's still growing", () => {
    const growing = buildChartSvg(chart([{ t: start, solarPower: 1 }, { t: start + minute, solarPower: 2 }], start + minute), 238, start + minute)!;
    expect(growing).toMatch(/>now<\/text>/);
    const finished = buildChartSvg(chart([{ t: start, solarPower: 1 }, { t: start + minute, solarPower: 2 }]), 238, start + 600 * minute)!;
    expect(finished).not.toMatch(/>now<\/text>/);
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

describe("easeToward", () => {
  it("moves part of the way toward the target each frame, more with more elapsed time", () => {
    const short = easeToward(0, 10, 16, 120);
    const long = easeToward(0, 10, 100, 120);
    expect(short).toBeGreaterThan(0);
    expect(short).toBeLessThan(long);
    expect(long).toBeLessThan(10);
  });

  it("snaps when there's nothing to ease from or to", () => {
    expect(easeToward(undefined, 7, 16, 120)).toBe(7);
    expect(easeToward(5, undefined, 16, 120)).toBeUndefined();
  });

  it("never overshoots", () => {
    expect(easeToward(0, 10, 10_000, 120)).toBeLessThanOrEqual(10);
  });
});

describe("easeAngleToward", () => {
  it("turns the short way across north", () => {
    const next = easeAngleToward(350, 10, 50, 120);
    expect(next > 350 || next < 10).toBe(true);
  });

  it("stays within 0..360", () => {
    for (const [from, to] of [[350, 10], [10, 350], [180, 0]] as const) {
      const next = easeAngleToward(from, to, 50, 120)!;
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(360);
    }
  });
});

describe("lockIconSvg", () => {
  it("draws a closed shackle when locked and an open one when unlocked", () => {
    const locked = lockIconSvg(true);
    const unlocked = lockIconSvg(false);
    expect(locked).toMatch(/^<svg[^>]*viewBox="0 0 16 16"/);
    expect(locked).toContain('data-lock="closed"');
    expect(unlocked).toContain('data-lock="open"');
    expect(locked).not.toBe(unlocked);
  });
});

describe("deviceCardHtml", () => {
  const at = (value: string) => ({ value, updatedAt: Date.now() - 5000 });
  const shunt = {
    mac: "e0b42569296f",
    name: "Shunt",
    model: "BMV-712 Smart",
    available: true,
    metrics: {
      alarm: at("NO_ALARM"),
      aux_mode: at("DISABLED"),
      consumed_ah: at("-51.6"),
      current: at("-1.862"),
      remaining_mins: at("14400"),
      soc: at("75.4"),
      voltage: at("13.26"),
    },
  };
  const solar = {
    mac: "dd1cc7607ae4",
    name: "Solar",
    available: true,
    metrics: {
      battery_charging_current: at("2.4"),
      battery_voltage: at("13.27"),
      charge_state: at("BULK"),
      charger_error: at("NO_ERROR"),
      external_device_load: at("0.0"),
      solar_power: at("35"),
      yield_today: at("1250"),
    },
  };
  const tileLabels = (html: string) => [...html.matchAll(/class="dc-label">(?:<svg[^]*?<\/svg>)?([^<]+)</g)].map((m) => m[1]);
  const moreSection = (html: string) => html.slice(html.indexOf("<details"));

  it("shows the name, the model line, and an online indicator", () => {
    const html = deviceCardHtml(shunt.mac, shunt, false);
    expect(html).toContain(">Shunt<");
    expect(html).toContain(">BMV-712 Smart<");
    expect(html).toMatch(/status-pill good[^]*>online</);
    expect(html).not.toContain("is-offline");
  });

  it("leaves out the model line until the model is known", () => {
    expect(deviceCardHtml(solar.mac, solar, false)).not.toContain("dc-model");
  });

  it("shows the key readings as tiles in a fixed order, with units", () => {
    const html = deviceCardHtml(solar.mac, solar, false);
    expect(tileLabels(html)).toEqual(["Battery voltage", "Power", "State", "Yield today", "Current", "Load current"]);
    expect(html).toContain("13.27<span class=\"u\">V</span>");
    expect(html).toContain("35<span class=\"u\">W</span>");
    expect(html).toContain("1.25<span class=\"u\">kWh</span>");
    expect(html).toMatch(/cs-bulk[^>]*>Bulk</);
  });

  it("shows the shunt's capped remaining time as infinity", () => {
    const html = deviceCardHtml(shunt.mac, shunt, false);
    expect(tileLabels(html)).toEqual(["Battery voltage", "Current", "State of charge", "Remaining time", "Consumed"]);
    expect(html).toContain(">∞<");
    expect(html).toContain("-1.86<span class=\"u\">A</span>");
    expect(html).toContain("75.4<span class=\"u\">%</span>");
  });

  it("formats an uncapped remaining time as hours and minutes", () => {
    const html = deviceCardHtml(shunt.mac, { ...shunt, metrics: { remaining_mins: at("605") } }, false);
    expect(html).toContain("10h 5m");
  });

  it("puts every other reading and the MAC behind the expand arrow, collapsed unless asked", () => {
    const html = deviceCardHtml(shunt.mac, shunt, false);
    const more = moreSection(html);
    expect(more).toContain("Alarm");
    expect(more).toContain("No alarm");
    expect(more).toContain("Aux mode");
    expect(more).toContain("e0b42569296f");
    expect(more).not.toContain("State of charge");
    expect(html).toMatch(/<details class="dc-more" data-mac="e0b42569296f">/);
    expect(deviceCardHtml(shunt.mac, shunt, true)).toMatch(/<details class="dc-more" data-mac="e0b42569296f" open>/);
  });

  it("picks the product photo from the readings the device sends", () => {
    expect(deviceCardHtml(shunt.mac, shunt, false)).toContain('src="img/victron/bmv-712.webp"');
    expect(deviceCardHtml(solar.mac, solar, false)).toContain('src="img/victron/smartsolar-mppt.webp"');
    expect(deviceCardHtml("x", { mac: "x", metrics: { input_voltage: at("13.2"), off_reason: at("NONE") } }, false)).toContain('src="img/victron/orion-smart.webp"');
    expect(deviceCardHtml("x", { mac: "x", metrics: { output_voltage1: at("13.2") } }, false)).toContain('src="img/victron/blue-smart-ip22.webp"');
    expect(deviceCardHtml("x", { mac: "x", metrics: { unknown: at("1") } }, false)).not.toContain("<img");
  });

  it("greys out an offline device and labels it, keeping its last values", () => {
    const html = deviceCardHtml(shunt.mac, { ...shunt, available: false }, false);
    expect(html).toContain("is-offline");
    expect(html).toMatch(/status-pill warn[^]*>offline</);
    expect(html).toContain("75.4");
  });

  it("shows no indicator while availability is unknown, and falls back to the MAC as the name", () => {
    const html = deviceCardHtml("x", { mac: "x", metrics: {} }, false);
    expect(html).not.toContain("status-pill");
    expect(html).toContain('class="dc-name">x<');
  });

  it("escapes names and models", () => {
    const html = deviceCardHtml("x", { mac: "x", name: "<b>", model: "a&b", metrics: {} }, false);
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("a&amp;b");
  });
});

import { describe, expect, it } from "vitest";
import { createMixer, gradientPair, hexToOklch, mixHex, oklchToHex } from "../public/color.js";

const HEX = /^#[0-9a-f]{6}$/;

function oklabDistance(x: { l: number; c: number; h: number }, y: { l: number; c: number; h: number }): number {
  const ab = (p: { c: number; h: number }) => [p.c * Math.cos((p.h * Math.PI) / 180), p.c * Math.sin((p.h * Math.PI) / 180)];
  const [xa, xb] = ab(x);
  const [ya, yb] = ab(y);
  return Math.hypot(x.l - y.l, xa! - ya!, xb! - yb!);
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

describe("hexToOklch / oklchToHex", () => {
  it("round-trips sRGB colors", () => {
    for (const hex of ["#e25c53", "#35c17a", "#43bdc2", "#d99a3d", "#000000", "#ffffff"]) {
      expect(oklchToHex(hexToOklch(hex))).toBe(hex);
    }
  });

  it("matches known OKLCH reference values", () => {
    const white = hexToOklch("#ffffff");
    expect(white.l).toBeCloseTo(1, 3);
    expect(white.c).toBeCloseTo(0, 3);
    const red = hexToOklch("#ff0000");
    expect(red.l).toBeCloseTo(0.628, 2);
    expect(red.c).toBeCloseTo(0.258, 2);
    expect(red.h).toBeCloseTo(29.2, 0);
  });

  it("keeps out-of-gamut requests inside sRGB by reducing chroma", () => {
    expect(oklchToHex({ l: 0.7, c: 0.5, h: 145 })).toMatch(HEX);
  });
});

describe("gradientPair", () => {
  for (const base of ["#e25c53", "#35c17a", "#43bdc2", "#d99a3d"]) {
    it(`derives a soft-to-vivid pair from ${base}`, () => {
      const { start, end } = gradientPair(base);
      expect(start).toMatch(HEX);
      expect(end).toMatch(HEX);

      const b = hexToOklch(base);
      const s = hexToOklch(start);
      const e = hexToOklch(end);
      expect(s.c).toBeLessThan(b.c);
      expect(e.c).toBeGreaterThanOrEqual(b.c - 0.005);
      expect(e.l).toBeGreaterThan(b.l);
      // The pair spans a wide, clearly visible range.
      expect(oklabDistance(s, e)).toBeGreaterThan(0.12);
      // The soft end leans warm: closer to amber than the base is.
      expect(hueDistance(s.h, 70)).toBeLessThan(hueDistance(b.h, 70));
    });
  }
});

describe("mixHex", () => {
  it("returns the endpoints at 0 and 1", () => {
    expect(mixHex("#e25c53", "#35c17a", 0)).toBe("#e25c53");
    expect(mixHex("#e25c53", "#35c17a", 1)).toBe("#35c17a");
  });

  it("interpolates in OKLab", () => {
    const mid = hexToOklch(mixHex("#000000", "#ffffff", 0.5));
    expect(mid.l).toBeCloseTo(0.5, 2);
  });
});

describe("createMixer", () => {
  it("matches mixHex at every point", () => {
    const mix = createMixer("#e25c53", "#35c17a");
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expect(mix(t)).toBe(mixHex("#e25c53", "#35c17a", t));
    }
  });
});

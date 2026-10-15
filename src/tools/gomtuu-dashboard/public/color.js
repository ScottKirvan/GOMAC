/**
 * OKLCH color math for the Power Gauge's ring gradients (#57). OKLab/OKLCH
 * per Björn Ottosson (https://bottosson.github.io/posts/oklab/), chosen
 * because equal steps in it look like equal steps, so derived pairs and
 * interpolated segments stay even across hues.
 */

/**
 * Tuning knobs for gradientPair -- this is visual design, expected to be
 * adjusted by eye. The soft end is desaturated and pulled toward a warm
 * hue (coral for red, goldenrod for green); the vivid end is more
 * saturated and a little brighter.
 */
const WARM_HUE = 70;
const SOFT_HUE_PULL = 0.4;
const SOFT_HUE_PULL_MAX = 35;
const SOFT_CHROMA = 0.72;
const SOFT_LIGHTNESS_SHIFT = 0.03;
const VIVID_CHROMA = 1.3;
const VIVID_LIGHTNESS_SHIFT = 0.07;

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c) {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

function hexToOklab(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = srgbToLinear(((n >> 16) & 255) / 255);
  const g = srgbToLinear(((n >> 8) & 255) / 255);
  const b = srgbToLinear((n & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function oklabToLinearRgb({ L, a, b }) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function inGamut(rgb) {
  return rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4);
}

function linearRgbToHex(rgb) {
  return `#${rgb
    .map((c) => Math.round(Math.min(1, Math.max(0, linearToSrgb(Math.min(1, Math.max(0, c))))) * 255))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

function lchToLab({ l, c, h }) {
  const rad = (h * Math.PI) / 180;
  return { L: l, a: c * Math.cos(rad), b: c * Math.sin(rad) };
}

export function hexToOklch(hex) {
  const { L, a, b } = hexToOklab(hex);
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return { l: L, c: Math.hypot(a, b), h: (h + 360) % 360 };
}

/** Out-of-gamut colors keep their lightness and hue and lose chroma until they fit sRGB. */
export function oklchToHex({ l, c, h }) {
  const lightness = Math.min(1, Math.max(0, l));
  let lo = 0;
  let hi = Math.max(0, c);
  if (inGamut(oklabToLinearRgb(lchToLab({ l: lightness, c: hi, h })))) {
    return linearRgbToHex(oklabToLinearRgb(lchToLab({ l: lightness, c: hi, h })));
  }
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklabToLinearRgb(lchToLab({ l: lightness, c: mid, h })))) lo = mid;
    else hi = mid;
  }
  return linearRgbToHex(oklabToLinearRgb(lchToLab({ l: lightness, c: lo, h })));
}

function pullHueToward(h, target, fraction, maxDeg) {
  const delta = ((target - h + 540) % 360) - 180;
  const shift = Math.sign(delta) * Math.min(Math.abs(delta) * fraction, maxDeg);
  return (h + shift + 360) % 360;
}

/** Soft-to-vivid gradient endpoints derived from one base color. */
export function gradientPair(baseHex) {
  const base = hexToOklch(baseHex);
  return {
    start: oklchToHex({
      l: base.l + SOFT_LIGHTNESS_SHIFT,
      c: base.c * SOFT_CHROMA,
      h: pullHueToward(base.h, WARM_HUE, SOFT_HUE_PULL, SOFT_HUE_PULL_MAX),
    }),
    end: oklchToHex({
      l: base.l + VIVID_LIGHTNESS_SHIFT,
      c: base.c * VIVID_CHROMA,
      h: base.h,
    }),
  };
}

/** Color `t` (0..1) of the way from `fromHex` to `toHex`, interpolated in OKLab. */
export function mixHex(fromHex, toHex, t) {
  if (t <= 0) return fromHex;
  if (t >= 1) return toHex;
  const a = hexToOklab(fromHex);
  const b = hexToOklab(toHex);
  return linearRgbToHex(
    oklabToLinearRgb({ L: a.L + (b.L - a.L) * t, a: a.a + (b.a - a.a) * t, b: a.b + (b.b - a.b) * t }),
  );
}

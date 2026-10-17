/**
 * Pure formatting/geometry/SVG-string helpers for app.js -- no DOM access,
 * so they can be unit tested under vitest (see test/render.test.ts).
 */

import { createMixer } from "./color.js";

export function fmt(value, digits, unit) {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}${unit ?? ""}`;
}

export function fmtSigned(value, digits, unit) {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}${unit ?? ""}`;
}

export function formatAge(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

export function formatDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = m / 60;
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
}

export function formatClock(ms) {
  if (ms === undefined || Number.isNaN(ms)) return "--:--";
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Point on a circle of radius `r` around (cx, cy), where angle 0 is
 * straight up (12 o'clock / top dead center) and positive angles sweep
 * clockwise -- i.e. a plain clock-face angle, not the math convention
 * (0 = 3 o'clock, CCW positive) SVG/trig normally uses.
 */

export function polarPointFromTop(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

const CHART_LEFT = 40;
// Leaves a gutter right of the plot for the end-of-line value labels
// (up to "12.34 kWh" at 11px monospace) inside the 600-wide viewBox.
const CHART_RIGHT = 536;
const END_LABEL_MIN_GAP = 12;

/**
 * Baseline y for the solar (above its point) and battery (below its point)
 * end labels, pushed apart symmetrically when the two lines finish close
 * enough that the labels would overlap.
 */
function separateLabelYs(solarPointY, battPointY) {
  let solarY = solarPointY === undefined ? undefined : solarPointY - 2;
  let battY = battPointY === undefined ? undefined : battPointY + 4;
  if (solarY !== undefined && battY !== undefined && Math.abs(solarY - battY) < END_LABEL_MIN_GAP) {
    const mid = (solarY + battY) / 2;
    const upper = mid - END_LABEL_MIN_GAP / 2;
    const lower = mid + END_LABEL_MIN_GAP / 2;
    if (solarY <= battY) {
      solarY = upper;
      battY = lower;
    } else {
      solarY = lower;
      battY = upper;
    }
  }
  return [solarY, battY];
}

/** Right-hand (Wh) scale headroom above the banked total, so its end label clears the scale label. */
const BANKED_SCALE_HEADROOM = 1.25;
const BANKED_SCALE_MIN_WH = 10;
const CHART_TOP = 10;
const CHART_BOTTOM = 150;

function energyLabel(wh) {
  return wh >= 1000 ? `${(wh / 1000).toFixed(2)} kWh` : `${Math.round(wh)} Wh`;
}

function clockLabel(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Solar power (W, left scale) and energy banked into the battery since the
 * window start (Wh, right scale, charging only) across the chart window.
 * `chart` is the snapshot's { start, end, samples }; `nowMs` is the server
 * time, used to label the right edge "now" while the window is growing.
 */
export function buildChartSvg(chart, solarPeakW, nowMs) {
  const pts = chart.samples.filter((s) => s.solarPower !== undefined || s.chargedWh !== undefined);
  if (pts.length < 2) return undefined;

  const t0 = chart.start;
  const t1 = Math.max(chart.end, t0 + 1);
  const xFor = (t) => CHART_LEFT + ((t - t0) / (t1 - t0)) * (CHART_RIGHT - CHART_LEFT);

  // Fixed top at the all-time solar peak, so the scale is stable and
  // comparable from day to day instead of rescaling to what's visible.
  const solarMax = Math.max(1, solarPeakW ?? 0, ...pts.map((p) => p.solarPower ?? 0)) * 1.1;
  const yForSolar = (w) => CHART_BOTTOM - (w / solarMax) * (CHART_BOTTOM - CHART_TOP);

  let banked = 0;
  const bankedPts = pts.map((p) => {
    banked += p.chargedWh ?? 0;
    return { t: p.t, wh: banked };
  });
  const bankedMax = Math.max(BANKED_SCALE_MIN_WH, banked * BANKED_SCALE_HEADROOM);
  const yForBanked = (wh) => CHART_BOTTOM - (wh / bankedMax) * (CHART_BOTTOM - CHART_TOP);

  const solarPts = pts.filter((p) => p.solarPower !== undefined);
  const solarLine = solarPts.map((p) => `${xFor(p.t).toFixed(1)},${yForSolar(p.solarPower).toFixed(1)}`).join(" ");
  const bankedLine = bankedPts.map((p) => `${xFor(p.t).toFixed(1)},${yForBanked(p.wh).toFixed(1)}`).join(" ");

  const lastSolar = solarPts[solarPts.length - 1];
  const lastBanked = bankedPts[bankedPts.length - 1];
  const [solarLabelY, bankedLabelY] = separateLabelYs(
    lastSolar ? yForSolar(lastSolar.solarPower) : undefined,
    lastBanked ? yForBanked(lastBanked.wh) : undefined,
  );

  const growing = nowMs !== undefined && chart.end >= nowMs - 60_000;
  const solarArea = solarLine
    ? `<polygon points="${solarLine} ${xFor(lastSolar.t).toFixed(1)},${CHART_BOTTOM} ${xFor(solarPts[0].t).toFixed(1)},${CHART_BOTTOM}" fill="url(#solarChartGrad)" />`
    : "";

  return `
    <svg viewBox="0 0 600 180">
      <defs>
        <linearGradient id="solarChartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--solar)" stop-opacity="0.22" />
          <stop offset="100%" stop-color="var(--solar)" stop-opacity="0" />
        </linearGradient>
      </defs>
      <line class="chart-grid-line" x1="${CHART_LEFT}" y1="${CHART_TOP}" x2="${CHART_RIGHT}" y2="${CHART_TOP}" />
      <text class="chart-axis-label" x="34" y="${CHART_TOP + 3}" text-anchor="end">${Math.round(solarMax)}W</text>
      <text class="chart-axis-label chart-axis-banked" x="${CHART_RIGHT}" y="${CHART_TOP - 2}" text-anchor="end">${energyLabel(bankedMax)}</text>
      <line class="chart-baseline" x1="${CHART_LEFT}" y1="${CHART_BOTTOM}" x2="${CHART_RIGHT}" y2="${CHART_BOTTOM}" />
      <text class="chart-axis-label" x="34" y="${CHART_BOTTOM + 3}" text-anchor="end">0</text>
      ${solarArea}
      ${solarLine ? `<polyline points="${solarLine}" fill="none" stroke="var(--solar)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />` : ""}
      ${lastSolar ? `<circle cx="${xFor(lastSolar.t).toFixed(1)}" cy="${yForSolar(lastSolar.solarPower).toFixed(1)}" r="4" fill="var(--solar)" /><text class="chart-endlabel" x="${(xFor(lastSolar.t) + 6).toFixed(1)}" y="${solarLabelY.toFixed(1)}" fill="var(--solar)">${Math.round(lastSolar.solarPower)}W</text>` : ""}
      <polyline points="${bankedLine}" fill="none" stroke="var(--battery)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      <circle cx="${xFor(lastBanked.t).toFixed(1)}" cy="${yForBanked(lastBanked.wh).toFixed(1)}" r="4" fill="var(--battery)" /><text class="chart-endlabel" x="${(xFor(lastBanked.t) + 6).toFixed(1)}" y="${bankedLabelY.toFixed(1)}" fill="var(--battery)">${energyLabel(lastBanked.wh)}</text>
      <text class="chart-axis-label" x="${CHART_LEFT}" y="170" text-anchor="start">${clockLabel(chart.start)}</text>
      <text class="chart-axis-label" x="${CHART_RIGHT}" y="170" text-anchor="end">${growing ? "now" : clockLabel(chart.end)}</text>
    </svg>
  `;
}

const COMPASS_POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export function compassLabel(deg) {
  if (deg === undefined) return "—";
  const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return COMPASS_POINTS[idx];
}

export function buildRttSparkline(history) {
  const pts = history.filter((s) => s.avgRttMs !== undefined).slice(-20);
  if (pts.length < 2) return undefined;

  const max = Math.max(...pts.map((p) => p.avgRttMs), 10) * 1.15;
  const xStep = 200 / (pts.length - 1);
  const points = pts.map((p, i) => `${(i * xStep).toFixed(1)},${(46 - (p.avgRttMs / max) * 42).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const lastX = ((pts.length - 1) * xStep).toFixed(1);
  const lastY = (46 - (last.avgRttMs / max) * 42).toFixed(1);

  return `
    <svg viewBox="0 0 200 50" preserveAspectRatio="none">
      <polyline points="${points}" fill="none" stroke="var(--connectivity)" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round" />
      <circle cx="${lastX}" cy="${lastY}" r="2.75" fill="var(--connectivity)" />
    </svg>
  `;
}

/**
 * Google's documented cross-platform Maps URL
 * (https://developers.google.com/maps/documentation/urls/get-started#search-action).
 */
export function googleMapsUrl(latitude, longitude) {
  if (latitude === undefined || longitude === undefined) return undefined;
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", `${latitude},${longitude}`);
  return url.toString();
}

/** "charge" for positive battery current, "draw" for negative, else undefined. */
export function currentDirection(current) {
  if (current === undefined || Number.isNaN(current) || current === 0) return undefined;
  return current > 0 ? "charge" : "draw";
}

/**
 * Display tone for a Victron charge state (victron_ble's OperationMode
 * names, as published by victron-ble-monitor.py). Unrecognized states fall
 * back to "neutral" rather than going uncolored.
 */
const CHARGE_STATE_TONES = {
  BULK: "bulk",
  ABSORPTION: "absorption",
  REPEATED_ABSORPTION: "absorption",
  EQUALIZE_MANUAL: "absorption",
  RECONDITION: "absorption",
  FLOAT: "float",
  STORAGE: "storage",
  FAULT: "fault",
  OFF: "off",
  LOW_POWER: "off",
  NOT_AVAILABLE: "off",
};

export function chargeStateTone(state) {
  if (state === undefined || state === null) return undefined;
  return CHARGE_STATE_TONES[String(state).toUpperCase()] ?? "neutral";
}

/** Icon per WMO weather-code group (see src/weather.ts for the full code list). */
export function weatherIcon(code) {
  if (code === undefined || code === null) return "";
  if (code === 0 || code === 1) return "☀️";
  if (code === 2) return "⛅";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code >= 51 && code <= 57) return "🌦️";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "🌧️";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "🌨️";
  if (code >= 95 && code <= 99) return "⛈️";
  return "";
}

export function forecastDayLabel(isoDate, index) {
  if (index === 0) return "Today";
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short" });
}

const GRADIENT_SEGMENT_DEG = 3;
// Each segment overlaps the next slightly so anti-aliasing doesn't leave
// hairline seams between them.
const GRADIENT_SEGMENT_OVERLAP_DEG = 0.6;

/**
 * A ring arc starting at 12 o'clock and sweeping `extentDeg` (clockwise
 * when positive), drawn as short segments so its color can follow the
 * curve -- SVG gradients only run in straight lines. The full gradient
 * runs along the visible arc, from `start` at 12 o'clock to `end` at the
 * tip, whatever the fill.
 */
export function gradientArcSvg({ cx, cy, r, strokeWidth, extentDeg, start, end }) {
  if (!extentDeg) return "";
  const sign = Math.sign(extentDeg);
  const total = Math.min(Math.abs(extentDeg), 359.9);
  const mix = createMixer(start, end);
  const colorAt = (deg) => mix(deg / total);
  const segments = [];
  for (let from = 0; from < total; from += GRADIENT_SEGMENT_DEG) {
    const to = Math.min(total, from + GRADIENT_SEGMENT_DEG + GRADIENT_SEGMENT_OVERLAP_DEG);
    const a = polarPointFromTop(cx, cy, r, sign * from);
    const b = polarPointFromTop(cx, cy, r, sign * to);
    segments.push(
      `<path d="M ${a.x.toFixed(3)} ${a.y.toFixed(3)} A ${r} ${r} 0 0 ${sign > 0 ? 1 : 0} ${b.x.toFixed(3)} ${b.y.toFixed(3)}" stroke="${colorAt((from + to) / 2)}" />`,
    );
  }
  const capR = strokeWidth / 2;
  const head = polarPointFromTop(cx, cy, r, 0);
  const tip = polarPointFromTop(cx, cy, r, sign * total);
  return `<g fill="none" stroke-width="${strokeWidth}" stroke-linecap="butt">${segments.join("")}</g>`
    + `<circle cx="${head.x.toFixed(3)}" cy="${head.y.toFixed(3)}" r="${capR}" fill="${colorAt(0)}" />`
    + `<circle cx="${tip.x.toFixed(3)}" cy="${tip.y.toFixed(3)}" r="${capR}" fill="${colorAt(total)}" />`;
}

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/**
 * Exponential ease of a displayed value toward its target: after `dtMs`,
 * the remaining gap shrinks by e^(-dt/tau). Snaps when either end is
 * missing, so a value appearing or disappearing isn't animated.
 */
export function easeToward(shown, target, dtMs, tauMs) {
  if (shown === undefined || target === undefined) return target;
  return shown + (target - shown) * (1 - Math.exp(-dtMs / tauMs));
}

/** easeToward for compass headings: turns the short way and stays in 0..360. */
export function easeAngleToward(shown, target, dtMs, tauMs) {
  if (shown === undefined || target === undefined) return target;
  const delta = ((target - shown + 540) % 360) - 180;
  const next = shown + delta * (1 - Math.exp(-dtMs / tauMs));
  return ((next % 360) + 360) % 360;
}

/**
 * Padlock icon for the header: closed when the page is talking to the
 * tailnet address (full data), open on the public one (approximate position).
 */
export function lockIconSvg(locked) {
  const shackle = locked ? "M5 7V5a3 3 0 0 1 6 0v2" : "M5 7V5a3 3 0 0 1 5.6-1.5";
  return `<svg class="net-lock-icon" viewBox="0 0 16 16" aria-hidden="true" data-lock="${locked ? "closed" : "open"}">`
    + `<path d="${shackle}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />`
    + `<rect x="3" y="7" width="10" height="7.5" rx="1.6" fill="currentColor" />`
    + `<circle cx="8" cy="10.6" r="1.1" fill="var(--surface)" />`
    + `</svg>`;
}

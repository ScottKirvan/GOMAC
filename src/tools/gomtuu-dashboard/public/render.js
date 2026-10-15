/**
 * Pure formatting/geometry/SVG-string helpers for app.js -- no DOM access,
 * so they can be unit tested under vitest (see test/render.test.ts).
 */

import { mixHex } from "./color.js";

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
// (up to "-1234W" at 11px monospace) inside the 600-wide viewBox.
const CHART_RIGHT = 548;
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

export function buildChartSvg(history, solarPeakW) {
  const pts = history.filter((s) => s.solarPower !== undefined || s.power !== undefined);
  if (pts.length < 2) return undefined;

  const allVals = [
    ...pts.map((p) => p.solarPower).filter((v) => v !== undefined),
    ...pts.map((p) => p.power).filter((v) => v !== undefined),
    0,
    // Fixed top at the all-time solar peak, so the chart's scale is stable
    // and comparable over time instead of rescaling to whatever's visible.
    solarPeakW ?? 0,
  ];
  let min = Math.min(...allVals);
  let max = Math.max(...allVals);
  if (min === max) {
    min -= 10;
    max += 10;
  }
  const pad = (max - min) * 0.1 || 10;
  min -= pad;
  max += pad;

  const t0 = pts[0].t;
  const t1 = pts[pts.length - 1].t;
  const xFor = (t) => (t1 === t0 ? CHART_LEFT : CHART_LEFT + ((t - t0) / (t1 - t0)) * (CHART_RIGHT - CHART_LEFT));
  const yFor = (v) => 150 - ((v - min) / (max - min)) * 140;

  const solarPts = pts.filter((p) => p.solarPower !== undefined);
  const battPts = pts.filter((p) => p.power !== undefined);
  const solarLine = solarPts.map((p) => `${xFor(p.t).toFixed(1)},${yFor(p.solarPower).toFixed(1)}`).join(" ");
  const battLine = battPts.map((p) => `${xFor(p.t).toFixed(1)},${yFor(p.power).toFixed(1)}`).join(" ");

  const zeroInRange = min <= 0 && 0 <= max;
  const zeroY = yFor(0);

  const lastSolar = solarPts[solarPts.length - 1];
  const lastBatt = battPts[battPts.length - 1];
  const [solarLabelY, battLabelY] = separateLabelYs(
    lastSolar ? yFor(lastSolar.solarPower) : undefined,
    lastBatt ? yFor(lastBatt.power) : undefined,
  );

  const gridLines = [
    `<line class="chart-grid-line" x1="40" y1="10" x2="${CHART_RIGHT}" y2="10" /><text class="chart-axis-label" x="34" y="13" text-anchor="end">${Math.round(max)}W</text>`,
    `<line class="chart-grid-line" x1="40" y1="150" x2="${CHART_RIGHT}" y2="150" /><text class="chart-axis-label" x="34" y="153" text-anchor="end">${Math.round(min)}W</text>`,
  ];
  if (zeroInRange) {
    gridLines.push(
      `<line class="chart-baseline" x1="40" y1="${zeroY.toFixed(1)}" x2="${CHART_RIGHT}" y2="${zeroY.toFixed(1)}" /><text class="chart-axis-label" x="34" y="${(zeroY + 3.5).toFixed(1)}" text-anchor="end">0W</text>`,
    );
  }

  const solarGrad = solarLine
    ? `<polygon points="${solarLine} ${xFor(t1).toFixed(1)},150 40,150" fill="url(#solarChartGrad)" />`
    : "";

  return `
    <svg viewBox="0 0 600 180">
      <defs>
        <linearGradient id="solarChartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--solar)" stop-opacity="0.22" />
          <stop offset="100%" stop-color="var(--solar)" stop-opacity="0" />
        </linearGradient>
      </defs>
      ${gridLines.join("")}
      ${solarGrad}
      ${solarLine ? `<polyline points="${solarLine}" fill="none" stroke="var(--solar)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />` : ""}
      ${lastSolar ? `<circle cx="${xFor(lastSolar.t).toFixed(1)}" cy="${yFor(lastSolar.solarPower).toFixed(1)}" r="4" fill="var(--solar)" /><text class="chart-endlabel" x="${(xFor(lastSolar.t) + 6).toFixed(1)}" y="${solarLabelY.toFixed(1)}" fill="var(--solar)">${Math.round(lastSolar.solarPower)}W</text>` : ""}
      ${battLine ? `<polyline points="${battLine}" fill="none" stroke="var(--battery)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />` : ""}
      ${lastBatt ? `<circle cx="${xFor(lastBatt.t).toFixed(1)}" cy="${yFor(lastBatt.power).toFixed(1)}" r="4" fill="var(--battery)" /><text class="chart-endlabel" x="${(xFor(lastBatt.t) + 6).toFixed(1)}" y="${battLabelY.toFixed(1)}" fill="var(--battery)">${Math.round(lastBatt.power)}W</text>` : ""}
      <text class="chart-axis-label" x="40" y="170" text-anchor="start">${formatDuration(t1 - t0)} ago</text>
      <text class="chart-axis-label" x="${CHART_RIGHT}" y="170" text-anchor="end">now</text>
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
 * curve -- SVG gradients only run in straight lines. Color is mapped over
 * the ring's full scale (0 to 360 degrees), so the tip is always the most
 * vivid part showing and a fuller ring reaches further toward `end`.
 */
export function gradientArcSvg({ cx, cy, r, strokeWidth, extentDeg, start, end }) {
  if (!extentDeg) return "";
  const sign = Math.sign(extentDeg);
  const total = Math.min(Math.abs(extentDeg), 359.9);
  const colorAt = (deg) => mixHex(start, end, deg / 360);
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

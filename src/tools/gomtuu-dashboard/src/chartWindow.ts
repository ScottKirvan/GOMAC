import type { PowerSample, WeatherState } from "./types.js";

const HOUR_MS = 60 * 60 * 1000;
/** The chart pads the daylight window by this much on each side. */
const DAYLIGHT_PADDING_MS = HOUR_MS;
const FALLBACK_SPAN_MS = 12 * HOUR_MS;
const POINT_MS = 60 * 1000;

export interface ChartWindow {
  start: number;
  end: number;
}

/** Open-Meteo's naive local times (e.g. "2026-10-17T07:28") to epoch ms, using the location's UTC offset. */
export function localTimeToEpoch(local: string, utcOffsetSeconds: number): number {
  return Date.parse(`${local}Z`) - utcOffsetSeconds * 1000;
}

function paddedDaylight(sunrise: string | undefined, sunset: string | undefined, offset: number): ChartWindow | undefined {
  if (sunrise === undefined || sunset === undefined) return undefined;
  return {
    start: localTimeToEpoch(sunrise, offset) - DAYLIGHT_PADDING_MS,
    end: localTimeToEpoch(sunset, offset) + DAYLIGHT_PADDING_MS,
  };
}

/**
 * The trend chart's time span: from an hour before today's sunrise to now,
 * stopping an hour after sunset. Before today's span starts, it shows the
 * previous day's span. Without sun times (no weather yet), the last 12 hours.
 */
export function chartWindow(weather: WeatherState, now: number = Date.now()): ChartWindow {
  const offset = weather.utcOffsetSeconds;
  if (offset !== undefined) {
    const today = paddedDaylight(weather.sunrise, weather.sunset, offset);
    if (today !== undefined && now >= today.start) {
      return { start: today.start, end: Math.min(now, today.end) };
    }
    const yesterday = paddedDaylight(weather.yesterdaySunrise, weather.yesterdaySunset, offset);
    if (yesterday !== undefined) return yesterday;
  }
  return { start: now - FALLBACK_SPAN_MS, end: now };
}

/**
 * The window's history merged into 1-minute points (peak solar power,
 * summed charged energy), so a full day's chart stays small enough to send
 * on every poll.
 */
export function chartSamples(samples: PowerSample[], start: number, end: number): PowerSample[] {
  const points: PowerSample[] = [];
  for (const sample of samples) {
    if (sample.t < start || sample.t > end) continue;
    const t = start + Math.floor((sample.t - start) / POINT_MS) * POINT_MS;
    let point = points[points.length - 1];
    if (point === undefined || point.t !== t) {
      point = { t };
      points.push(point);
    }
    if (sample.solarPower !== undefined) {
      point.solarPower = point.solarPower === undefined ? sample.solarPower : Math.max(point.solarPower, sample.solarPower);
    }
    if (sample.chargedWh !== undefined) point.chargedWh = (point.chargedWh ?? 0) + sample.chargedWh;
  }
  return points;
}

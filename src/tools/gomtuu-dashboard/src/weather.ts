import type { Logger } from "./logger.js";
import type { DailyForecast, PositionState, WeatherState } from "./types.js";

const OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast";
const FORECAST_DAYS = 4;
const FETCH_TIMEOUT_MS = 10_000;

/**
 * WMO weather interpretation codes, per Open-Meteo's docs
 * (https://open-meteo.com/en/docs -- "WMO Weather interpretation codes").
 * Not every code in the spec is enumerated (e.g. the 96/99 hail variants
 * are covered, some rarer intermediate codes aren't) -- falls back to a
 * labeled "unknown code" rather than silently showing nothing.
 */
const WMO_CONDITIONS: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow fall",
  73: "Moderate snow fall",
  75: "Heavy snow fall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

export function describeConditionCode(code: number | undefined): string | undefined {
  if (code === undefined) {
    return undefined;
  }
  return WMO_CONDITIONS[code] ?? `Unknown conditions (code ${code})`;
}

interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
    wind_gusts_10m?: number;
  };
  utc_offset_seconds?: number;
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
    sunrise?: string[];
    sunset?: string[];
  };
}

/** Index of today in the daily arrays: past_days=1 puts yesterday first. */
const TODAY = 1;

function dailyForecast(daily: OpenMeteoResponse["daily"]): DailyForecast[] {
  return (daily?.time ?? []).slice(TODAY).map((date, offset) => {
    const i = offset + TODAY;
    const conditionCode = daily?.weather_code?.[i];
    return {
      date,
      conditionCode,
      condition: describeConditionCode(conditionCode),
      highC: daily?.temperature_2m_max?.[i],
      lowC: daily?.temperature_2m_min?.[i],
      precipitationChancePct: daily?.precipitation_probability_max?.[i],
    };
  });
}

export async function fetchWeather(
  latitude: number,
  longitude: number,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<WeatherState> {
  const url = new URL(OPEN_METEO_BASE);
  url.searchParams.set("latitude", latitude.toFixed(4));
  url.searchParams.set("longitude", longitude.toFixed(4));
  url.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
  );
  url.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",
  );
  url.searchParams.set("forecast_days", String(FORECAST_DAYS));
  // Yesterday's sunrise and sunset frame the power chart until today's window starts.
  url.searchParams.set("past_days", "1");
  url.searchParams.set("timezone", "auto");

  // Without a timeout, a half-working link (WiFi up, no route out) can hang
  // a request for minutes instead of failing.
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error(`open-meteo request timed out after ${timeoutMs / 1000}s`)),
    timeoutMs,
  );
  let data: OpenMeteoResponse;
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`open-meteo request failed: ${res.status} ${res.statusText}`);
    }
    data = (await res.json()) as OpenMeteoResponse;
  } finally {
    clearTimeout(timeout);
  }

  return {
    temperatureC: data.current?.temperature_2m,
    apparentTemperatureC: data.current?.apparent_temperature,
    conditionCode: data.current?.weather_code,
    condition: describeConditionCode(data.current?.weather_code),
    windSpeedKph: data.current?.wind_speed_10m,
    windDirectionDeg: data.current?.wind_direction_10m,
    windGustKph: data.current?.wind_gusts_10m,
    forecast: dailyForecast(data.daily),
    sunrise: data.daily?.sunrise?.[TODAY],
    sunset: data.daily?.sunset?.[TODAY],
    yesterdaySunrise: data.daily?.sunrise?.[TODAY - 1],
    yesterdaySunset: data.daily?.sunset?.[TODAY - 1],
    utcOffsetSeconds: data.utc_offset_seconds,
    updatedAt: Date.now(),
    sourceLatitude: latitude,
    sourceLongitude: longitude,
  };
}

export interface WeatherPoller {
  stop(): void;
}

const POSITION_WAIT_MS = 10_000;
const FIRST_RETRY_MS = 60_000;

/**
 * Polls Open-Meteo every `intervalMs` (quarter-hourly by default, well
 * within Open-Meteo's free-tier limits -- see README) once it has a GPS
 * fix. Until the first fix it re-checks the in-memory position every 10s,
 * since the retained `gps/phone` message usually lands just after startup.
 * After a failed fetch it retries at 1, 2, 4, 8... minutes, capped at
 * `intervalMs`, so weather comes back soon after the network does without
 * hammering Open-Meteo while the van is offline. Each attempt is scheduled
 * only after the previous one finishes, so attempts never overlap. Logs
 * only state changes (waiting for GPS, failing, recovered), not every try.
 */
export function startWeatherPoller(
  getPosition: () => PositionState,
  onUpdate: (weather: WeatherState) => void,
  logger: Logger,
  intervalMs: number,
): WeatherPoller {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let failures = 0;
  let loggedWaitingForGps = false;

  const schedule = (delayMs: number): void => {
    if (!stopped) {
      timer = setTimeout(() => void tick(), delayMs);
    }
  };

  const tick = async (): Promise<void> => {
    const pos = getPosition();
    if (pos.latitude === undefined || pos.longitude === undefined) {
      if (!loggedWaitingForGps) {
        logger.info("weather: waiting for a GPS fix before the first fetch");
        loggedWaitingForGps = true;
      }
      schedule(POSITION_WAIT_MS);
      return;
    }
    try {
      const weather = await fetchWeather(pos.latitude, pos.longitude);
      if (stopped) return;
      onUpdate(weather);
      if (failures > 0) {
        logger.info(`weather fetch recovered after ${failures} failed attempt${failures === 1 ? "" : "s"}`);
      }
      failures = 0;
      schedule(intervalMs);
    } catch (err) {
      if (stopped) return;
      failures += 1;
      if (failures === 1) {
        logger.error(`weather fetch failing: ${(err as Error).message}`);
      }
      schedule(Math.min(FIRST_RETRY_MS * 2 ** (failures - 1), intervalMs));
    }
  };

  void tick();

  return {
    stop: () => {
      stopped = true;
      clearTimeout(timer);
    },
  };
}

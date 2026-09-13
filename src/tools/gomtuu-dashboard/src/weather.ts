import type { Logger } from "./logger.js";
import type { PositionState, WeatherState } from "./types.js";

const OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast";

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
  };
  daily?: {
    sunrise?: string[];
    sunset?: string[];
  };
}

export async function fetchWeather(latitude: number, longitude: number): Promise<WeatherState> {
  const url = new URL(OPEN_METEO_BASE);
  url.searchParams.set("latitude", latitude.toFixed(4));
  url.searchParams.set("longitude", longitude.toFixed(4));
  url.searchParams.set("current", "temperature_2m,apparent_temperature,weather_code,wind_speed_10m");
  url.searchParams.set("daily", "sunrise,sunset");
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`open-meteo request failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as OpenMeteoResponse;

  return {
    temperatureC: data.current?.temperature_2m,
    apparentTemperatureC: data.current?.apparent_temperature,
    conditionCode: data.current?.weather_code,
    condition: describeConditionCode(data.current?.weather_code),
    windSpeedKph: data.current?.wind_speed_10m,
    sunrise: data.daily?.sunrise?.[0],
    sunset: data.daily?.sunset?.[0],
    updatedAt: Date.now(),
    sourceLatitude: latitude,
    sourceLongitude: longitude,
  };
}

export interface WeatherPoller {
  stop(): void;
}

/**
 * Polls Open-Meteo on a fixed interval rather than only on GPS movement --
 * simpler, and well within Open-Meteo's free-tier rate limits at a
 * quarter-hourly default (see README).
 */
export function startWeatherPoller(
  getPosition: () => PositionState,
  onUpdate: (weather: WeatherState) => void,
  logger: Logger,
  intervalMs: number,
): WeatherPoller {
  const tick = async (): Promise<void> => {
    const pos = getPosition();
    if (pos.latitude === undefined || pos.longitude === undefined) {
      return;
    }
    try {
      const weather = await fetchWeather(pos.latitude, pos.longitude);
      onUpdate(weather);
    } catch (err) {
      logger.error(`weather fetch failed: ${(err as Error).message}`);
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), intervalMs);

  return {
    stop: () => clearInterval(timer),
  };
}

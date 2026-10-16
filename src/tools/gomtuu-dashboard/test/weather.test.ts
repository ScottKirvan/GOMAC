import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeConditionCode, fetchWeather, startWeatherPoller } from "../src/weather.js";
import type { Logger } from "../src/logger.js";
import type { PositionState } from "../src/types.js";

const silentLogger: Logger = { info() {}, warn() {}, error() {} };

describe("describeConditionCode", () => {
  it("maps known WMO codes to a human-readable label", () => {
    expect(describeConditionCode(0)).toBe("Clear sky");
    expect(describeConditionCode(61)).toBe("Slight rain");
  });

  it("falls back to a labeled unknown rather than nothing for unmapped codes", () => {
    expect(describeConditionCode(12345)).toBe("Unknown conditions (code 12345)");
  });

  it("returns undefined when no code is present", () => {
    expect(describeConditionCode(undefined)).toBeUndefined();
  });
});

describe("fetchWeather", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps a successful Open-Meteo response into WeatherState", async () => {
    const mockResponse = {
      current: { temperature_2m: 19, apparent_temperature: 17, weather_code: 2, wind_speed_10m: 14 },
      daily: { sunrise: ["2026-09-13T06:42"], sunset: ["2026-09-13T19:18"] },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockResponse) }),
    );

    const weather = await fetchWeather(45.5017, -73.5673);

    expect(weather.temperatureC).toBe(19);
    expect(weather.apparentTemperatureC).toBe(17);
    expect(weather.condition).toBe("Partly cloudy");
    expect(weather.windSpeedKph).toBe(14);
    expect(weather.sunrise).toBe("2026-09-13T06:42");
    expect(weather.sunset).toBe("2026-09-13T19:18");
    expect(weather.sourceLatitude).toBe(45.5017);
    expect(weather.sourceLongitude).toBe(-73.5673);
  });

  it("maps wind direction, gusts, and the daily forecast", async () => {
    const mockResponse = {
      current: { temperature_2m: 19, weather_code: 2, wind_speed_10m: 14, wind_direction_10m: 225, wind_gusts_10m: 31 },
      daily: {
        time: ["2026-09-13", "2026-09-14", "2026-09-15"],
        weather_code: [2, 61, 0],
        temperature_2m_max: [21, 17.5, 24],
        temperature_2m_min: [9, 8, 11],
        precipitation_probability_max: [5, 80, 0],
        sunrise: ["2026-09-13T06:42", "2026-09-14T06:43", "2026-09-15T06:45"],
        sunset: ["2026-09-13T19:18", "2026-09-14T19:16", "2026-09-15T19:14"],
      },
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockResponse) });
    vi.stubGlobal("fetch", fetchMock);

    const weather = await fetchWeather(45.5017, -73.5673);

    expect(weather.windDirectionDeg).toBe(225);
    expect(weather.windGustKph).toBe(31);
    expect(weather.forecast).toEqual([
      { date: "2026-09-13", conditionCode: 2, condition: "Partly cloudy", highC: 21, lowC: 9, precipitationChancePct: 5 },
      { date: "2026-09-14", conditionCode: 61, condition: "Slight rain", highC: 17.5, lowC: 8, precipitationChancePct: 80 },
      { date: "2026-09-15", conditionCode: 0, condition: "Clear sky", highC: 24, lowC: 11, precipitationChancePct: 0 },
    ]);
    expect(weather.sunrise).toBe("2026-09-13T06:42");

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("current")).toContain("wind_direction_10m");
    expect(url.searchParams.get("current")).toContain("wind_gusts_10m");
    expect(url.searchParams.get("daily")).toContain("temperature_2m_max");
    expect(url.searchParams.get("forecast_days")).toBe("4");
  });

  it("leaves the forecast empty when the response has no daily dates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ current: { temperature_2m: 19 }, daily: {} }) }),
    );
    const weather = await fetchWeather(0, 0);
    expect(weather.forecast).toEqual([]);
  });

  it("throws on a non-ok response rather than returning a half-filled state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: "Server Error" }));
    await expect(fetchWeather(0, 0)).rejects.toThrow("open-meteo request failed: 500 Server Error");
  });
});

describe("startWeatherPoller", () => {
  const MINUTE = 60_000;
  const INTERVAL = 15 * MINUTE;
  const okResponse = { ok: true, json: () => Promise.resolve({ current: { temperature_2m: 19 }, daily: {} }) };

  function recordingLogger() {
    const lines = { info: [] as string[], warn: [] as string[], error: [] as string[] };
    const logger: Logger = {
      info: (m) => lines.info.push(m),
      warn: (m) => lines.warn.push(m),
      error: (m) => lines.error.push(m),
    };
    return { logger, lines };
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("skips fetching when no GPS fix is known yet", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const poller = startWeatherPoller(() => ({}), () => {}, silentLogger, INTERVAL);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).not.toHaveBeenCalled();
    poller.stop();
  });

  it("fetches immediately once a position is available and reports the result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse));

    const onUpdate = vi.fn();
    const poller = startWeatherPoller(() => ({ latitude: 45.5, longitude: -73.5 }), onUpdate, silentLogger, INTERVAL);
    await vi.advanceTimersByTimeAsync(0);

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0].temperatureC).toBe(19);
    poller.stop();
  });

  it("fetches within seconds when the first fix arrives after startup, not a full interval later", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse);
    vi.stubGlobal("fetch", fetchMock);
    let position: PositionState = {};

    const poller = startWeatherPoller(() => position, () => {}, silentLogger, INTERVAL);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).not.toHaveBeenCalled();

    position = { latitude: 45.5, longitude: -73.5 };
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it("logs the wait for a GPS fix once, not on every check", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { logger, lines } = recordingLogger();

    const poller = startWeatherPoller(() => ({}), () => {}, logger, INTERVAL);
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    expect(lines.info.filter((l) => l.includes("GPS"))).toHaveLength(1);
    poller.stop();
  });

  it("refetches on the normal interval after a success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse);
    vi.stubGlobal("fetch", fetchMock);

    const poller = startWeatherPoller(() => ({ latitude: 45.5, longitude: -73.5 }), () => {}, silentLogger, INTERVAL);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(INTERVAL - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it("backs off 1, 2, 4, 8 minutes after failures, capped at the normal interval", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const poller = startWeatherPoller(() => ({ latitude: 45.5, longitude: -73.5 }), () => {}, silentLogger, INTERVAL);
    await vi.advanceTimersByTimeAsync(0);
    const expectedGaps = [1, 2, 4, 8, 15, 15].map((m) => m * MINUTE);
    for (const [i, gap] of expectedGaps.entries()) {
      await vi.advanceTimersByTimeAsync(gap - 1);
      expect(fetchMock).toHaveBeenCalledTimes(i + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(i + 2);
    }
    poller.stop();
  });

  it("logs only when fetching starts failing and when it recovers", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockRejectedValueOnce(new Error("network down"))
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValue(okResponse);
    vi.stubGlobal("fetch", fetchMock);
    const { logger, lines } = recordingLogger();

    const poller = startWeatherPoller(() => ({ latitude: 45.5, longitude: -73.5 }), () => {}, logger, INTERVAL);
    await vi.advanceTimersByTimeAsync((1 + 2 + 4) * MINUTE);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(lines.error).toHaveLength(1);
    expect(lines.error[0]).toContain("network down");
    expect(lines.info.filter((l) => l.includes("recovered"))).toHaveLength(1);
    poller.stop();
  });

  it("returns to the short backoff when fetching fails after a success", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(okResponse).mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const poller = startWeatherPoller(() => ({ latitude: 45.5, longitude: -73.5 }), () => {}, silentLogger, INTERVAL);
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    poller.stop();
  });

  it("times out a hung request and treats it as a failure", async () => {
    const fetchMock = vi.fn(
      (_url: unknown, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { logger, lines } = recordingLogger();

    const poller = startWeatherPoller(() => ({ latitude: 45.5, longitude: -73.5 }), () => {}, logger, INTERVAL);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(lines.error).toHaveLength(1);
    // Next attempt follows the 1-minute backoff, and attempts never overlap.
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it("stops scheduling once stopped, even if a fetch was in flight", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    const fetchMock = vi.fn(() => new Promise((resolve) => (resolveFetch = resolve)));
    vi.stubGlobal("fetch", fetchMock);
    const onUpdate = vi.fn();

    const poller = startWeatherPoller(() => ({ latitude: 45.5, longitude: -73.5 }), onUpdate, silentLogger, INTERVAL);
    await vi.advanceTimersByTimeAsync(0);
    poller.stop();
    resolveFetch(okResponse);
    await vi.advanceTimersByTimeAsync(2 * INTERVAL);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

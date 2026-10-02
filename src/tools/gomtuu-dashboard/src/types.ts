export interface VictronMetric {
  value: string;
  updatedAt: number;
}

export interface VictronDeviceState {
  mac: string;
  metrics: Record<string, VictronMetric>;
}

export interface PowerSummary {
  soc?: number;
  voltage?: number;
  current?: number;
  power?: number;
  /**
   * Victron's "amp-hours consumed since last full charge" reading
   * (BMV-712's `consumed_ah`), negative-since-full -- e.g. -31.0 means
   * 31Ah drawn down from a full charge. Used by the dashboard to derive
   * Ah remaining against an assumed nominal pack capacity, in preference
   * to deriving it from `soc` (the two don't necessarily agree, since the
   * BMV-712's own internally configured capacity setting may not match
   * the dashboard's assumption).
   */
  consumedAh?: number;
  temperature?: number;
  chargerState?: string;
  solarPower?: number;
  batteryDeviceMac?: string;
  solarDeviceMac?: string;
}

export interface NowPlayingState {
  title?: string;
  artist?: string;
  album?: string;
  station?: string;
  rating?: string;
  coverArt?: string;
  songDurationMs?: number;
  songPlayedMs?: number;
  stations?: string[];
  updatedAt?: number;
}

/**
 * Polled from Open-Meteo against the live `gps/phone` coordinates (Scott's
 * call over reusing HA's weather.home -- see the README's Open Questions
 * for why: this way it's guaranteed to track Gomtuu's actual position).
 * Absent fields mean "no successful fetch yet", not zero.
 */
export interface WeatherState {
  temperatureC?: number;
  apparentTemperatureC?: number;
  conditionCode?: number;
  condition?: string;
  windSpeedKph?: number;
  sunrise?: string;
  sunset?: string;
  updatedAt?: number;
  sourceLatitude?: number;
  sourceLongitude?: number;
}

/**
 * `gps/phone/<metric>` -- per the IT-side report confirming this is live:
 * latitude, longitude, accuracy_m, altitude_m, speed_mps, course_deg,
 * retained, updated on every phone location report.
 */
export interface PositionState {
  latitude?: number;
  longitude?: number;
  accuracyM?: number;
  altitudeM?: number;
  speedMps?: number;
  courseDeg?: number;
  updatedAt?: number;
}

/**
 * `ping-monitor/<target>/<metric>` for target in 8.8.8.8 / 1.1.1.1 /
 * gateway, metric in rtt_ms / success -- per the IT-side report, retained,
 * on ping-monitor's existing minutely timer.
 */
export interface PingTargetState {
  rttMs?: number;
  success?: boolean;
  updatedAt?: number;
}

export interface ConnectivityState {
  targets: Record<string, PingTargetState>;
}

export interface ConnectivitySummary {
  successPct?: number;
  avgRttMs?: number;
}

export interface ConnectivitySample {
  t: number;
  successPct?: number;
  avgRttMs?: number;
}

export interface DashboardSnapshot {
  victron: {
    devices: Record<string, VictronDeviceState>;
    power: PowerSummary;
    history: PowerSample[];
    solarPeak: SolarPeakSummary;
  };
  nowPlaying: NowPlayingState;
  position: PositionState;
  weather: WeatherState;
  connectivity: {
    targets: Record<string, PingTargetState>;
    summary: ConnectivitySummary;
    history: ConnectivitySample[];
  };
  serverTime: number;
}

export interface SolarPeakSummary {
  /** Highest solar power seen within the window; undefined until any reading arrives. */
  watts?: number;
  /** Start of the minute the peak occurred in, epoch ms. */
  at?: number;
  /** Configured window length (SOLAR_PEAK_WINDOW_HOURS). */
  windowMs: number;
  /** How much of the window has real data behind it (< windowMs right after a first-ever start). */
  coveredMs: number;
}

export interface PowerSample {
  t: number;
  soc?: number;
  voltage?: number;
  power?: number;
  solarPower?: number;
}

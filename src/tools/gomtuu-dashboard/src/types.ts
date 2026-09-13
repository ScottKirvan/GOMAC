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

export interface PowerSample {
  t: number;
  soc?: number;
  voltage?: number;
  power?: number;
  solarPower?: number;
}

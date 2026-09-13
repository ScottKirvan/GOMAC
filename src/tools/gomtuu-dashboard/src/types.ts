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
 * Sources with no real data feed yet, honest per CLAUDE.md's "don't
 * fabricate" rule -- see the dashboard README's Open Questions for what's
 * blocking each one. `connected: false` always, until a real feed exists.
 */
export interface UnwiredSource {
  connected: false;
  reason: string;
}

export interface DashboardSnapshot {
  victron: {
    devices: Record<string, VictronDeviceState>;
    power: PowerSummary;
    history: PowerSample[];
  };
  nowPlaying: NowPlayingState;
  position: UnwiredSource;
  weather: UnwiredSource;
  connectivity: UnwiredSource;
  serverTime: number;
}

export interface PowerSample {
  t: number;
  soc?: number;
  voltage?: number;
  power?: number;
  solarPower?: number;
}

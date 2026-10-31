import { createConnectivityHistory, type ConnectivityHistory } from "./connectivityHistory.js";
import { createConnectivityState, summarizeConnectivity } from "./connectivityState.js";
import { chartSamples, chartWindow } from "./chartWindow.js";
import { computeEnergyFlows, createGhostHold, type GhostHold } from "./energyFlows.js";
import { createPowerHistory, type PowerHistory } from "./history.js";
import { createNowPlayingState } from "./pandoraState.js";
import { coarsenPosition, createPositionState } from "./positionState.js";
import { createSolarPeakStore, summarizeSolarPeak, type SolarPeakStore } from "./solarPeak.js";
import { createStarlinkStore, summarizeStarlink, type StarlinkStore } from "./starlinkState.js";
import type { ConnectivityState, DashboardSnapshot, EnergyFlows, NowPlayingState, PositionState, WeatherState } from "./types.js";
import { createVictronStore, summarizePower, type VictronStore } from "./victronState.js";

export interface DashboardStores {
  victron: VictronStore;
  nowPlaying: NowPlayingState;
  position: PositionState;
  weather: WeatherState;
  connectivity: ConnectivityState;
  powerHistory: PowerHistory;
  connectivityHistory: ConnectivityHistory;
  solarPeak: SolarPeakStore;
  starlink: StarlinkStore;
  ghostHold: GhostHold;
}

export function createDashboardStores(
  solarPeak: SolarPeakStore = createSolarPeakStore(),
  powerHistory: PowerHistory = createPowerHistory(),
): DashboardStores {
  return {
    victron: createVictronStore(),
    nowPlaying: createNowPlayingState(),
    position: createPositionState(),
    weather: {},
    connectivity: createConnectivityState(),
    powerHistory,
    connectivityHistory: createConnectivityHistory(),
    solarPeak,
    starlink: createStarlinkStore(),
    ghostHold: createGhostHold(),
  };
}

export function currentEnergyFlows(stores: DashboardStores, now: number = Date.now()): EnergyFlows {
  return computeEnergyFlows(stores.victron, summarizeStarlink(stores.starlink, now), stores.ghostHold, now);
}

export function buildSnapshot(stores: DashboardStores, now: number = Date.now()): DashboardSnapshot {
  const window = chartWindow(stores.weather, now);
  const connectivitySummary = summarizeConnectivity(stores.connectivity);
  return {
    victron: {
      devices: stores.victron.devices,
      power: summarizePower(stores.victron),
      chart: { ...window, samples: chartSamples(stores.powerHistory.samples, window.start, window.end) },
      solarPeak: summarizeSolarPeak(stores.solarPeak),
      flows: currentEnergyFlows(stores, now),
    },
    nowPlaying: stores.nowPlaying,
    position: stores.position,
    weather: stores.weather,
    connectivity: {
      targets: stores.connectivity.targets,
      summary: connectivitySummary,
      history: stores.connectivityHistory.samples,
    },
    serverTime: now,
  };
}

/**
 * Limits what reveals Gomtuu's real-world location, for the port meant to
 * be published publicly (`tailscale funnel`). `position` is coarsened to an
 * approximate location (see coarsenPosition); `weather.sourceLatitude/
 * sourceLongitude` is removed outright, since it's a second,
 * easy-to-miss leak of the exact same coordinates via a different field,
 * since weather is fetched by querying Open-Meteo with the live GPS fix.
 * The unredacted snapshot stays available on the private port
 * (`tailscale serve`, tailnet-only) for anyone who actually needs position.
 */
export function redactPositionForPublic(snapshot: DashboardSnapshot): DashboardSnapshot {
  const { sourceLatitude, sourceLongitude, ...weatherWithoutSource } = snapshot.weather;
  return {
    ...snapshot,
    position: coarsenPosition(snapshot.position),
    weather: weatherWithoutSource,
  };
}

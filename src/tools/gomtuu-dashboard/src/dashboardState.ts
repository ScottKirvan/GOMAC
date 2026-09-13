import { createConnectivityHistory, type ConnectivityHistory } from "./connectivityHistory.js";
import { createConnectivityState, summarizeConnectivity } from "./connectivityState.js";
import { createPowerHistory, type PowerHistory } from "./history.js";
import { createNowPlayingState } from "./pandoraState.js";
import { createPositionState } from "./positionState.js";
import type { ConnectivityState, DashboardSnapshot, NowPlayingState, PositionState, WeatherState } from "./types.js";
import { createVictronStore, summarizePower, type VictronStore } from "./victronState.js";

export interface DashboardStores {
  victron: VictronStore;
  nowPlaying: NowPlayingState;
  position: PositionState;
  weather: WeatherState;
  connectivity: ConnectivityState;
  powerHistory: PowerHistory;
  connectivityHistory: ConnectivityHistory;
}

export function createDashboardStores(): DashboardStores {
  return {
    victron: createVictronStore(),
    nowPlaying: createNowPlayingState(),
    position: createPositionState(),
    weather: {},
    connectivity: createConnectivityState(),
    powerHistory: createPowerHistory(),
    connectivityHistory: createConnectivityHistory(),
  };
}

export function buildSnapshot(stores: DashboardStores): DashboardSnapshot {
  const connectivitySummary = summarizeConnectivity(stores.connectivity);
  return {
    victron: {
      devices: stores.victron.devices,
      power: summarizePower(stores.victron),
      history: stores.powerHistory.samples,
    },
    nowPlaying: stores.nowPlaying,
    position: stores.position,
    weather: stores.weather,
    connectivity: {
      targets: stores.connectivity.targets,
      summary: connectivitySummary,
      history: stores.connectivityHistory.samples,
    },
    serverTime: Date.now(),
  };
}

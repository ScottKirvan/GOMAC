import { createConnectivityHistory, type ConnectivityHistory } from "./connectivityHistory.js";
import { createConnectivityState, summarizeConnectivity } from "./connectivityState.js";
import { createPowerHistory, type PowerHistory } from "./history.js";
import { createNowPlayingState } from "./pandoraState.js";
import { createPositionState } from "./positionState.js";
import type { ConnectivityState, DashboardSnapshot, NowPlayingState, PositionState, UnwiredSource } from "./types.js";
import { createVictronStore, summarizePower, type VictronStore } from "./victronState.js";

/**
 * Weather has no real data feed wired up yet -- see README.md's Open
 * Questions (HA's weather.home vs. standing up Open-Meteo directly
 * against the live GPS coords, still Scott's call). Position and
 * connectivity were unwired here too until the IT-side agent confirmed
 * both are now live over MQTT.
 */
const WEATHER_UNWIRED: UnwiredSource = {
  connected: false,
  reason: "no weather provider decided yet -- HA's weather.home vs. Open-Meteo against live GPS, pending a decision",
};

export interface DashboardStores {
  victron: VictronStore;
  nowPlaying: NowPlayingState;
  position: PositionState;
  connectivity: ConnectivityState;
  powerHistory: PowerHistory;
  connectivityHistory: ConnectivityHistory;
}

export function createDashboardStores(): DashboardStores {
  return {
    victron: createVictronStore(),
    nowPlaying: createNowPlayingState(),
    position: createPositionState(),
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
    weather: WEATHER_UNWIRED,
    connectivity: {
      targets: stores.connectivity.targets,
      summary: connectivitySummary,
      history: stores.connectivityHistory.samples,
    },
    serverTime: Date.now(),
  };
}

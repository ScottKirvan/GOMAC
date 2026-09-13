import { createPowerHistory, type PowerHistory } from "./history.js";
import { createNowPlayingState } from "./pandoraState.js";
import type { DashboardSnapshot, NowPlayingState, UnwiredSource } from "./types.js";
import { createVictronStore, summarizePower, type VictronStore } from "./victronState.js";

/**
 * Position, weather, and connectivity have no real data feed wired up
 * yet -- see README.md's Open Questions. Rendering `connected: false`
 * with a reason (rather than sample numbers) keeps the running dashboard
 * honest about what's actually live, unlike the earlier mockups.
 */
const POSITION_UNWIRED: UnwiredSource = {
  connected: false,
  reason: "GPS source not confirmed yet -- pending answer on how phone GPS reaches this service",
};
const WEATHER_UNWIRED: UnwiredSource = {
  connected: false,
  reason: "no weather provider wired up yet -- pending provider/key decision",
};
const CONNECTIVITY_UNWIRED: UnwiredSource = {
  connected: false,
  reason: "ping-monitor writes to a CSV on TheFlea, not MQTT -- not consumable by this service yet",
};

export interface DashboardStores {
  victron: VictronStore;
  nowPlaying: NowPlayingState;
  powerHistory: PowerHistory;
}

export function createDashboardStores(): DashboardStores {
  return {
    victron: createVictronStore(),
    nowPlaying: createNowPlayingState(),
    powerHistory: createPowerHistory(),
  };
}

export function buildSnapshot(stores: DashboardStores): DashboardSnapshot {
  return {
    victron: {
      devices: stores.victron.devices,
      power: summarizePower(stores.victron),
      history: stores.powerHistory.samples,
    },
    nowPlaying: stores.nowPlaying,
    position: POSITION_UNWIRED,
    weather: WEATHER_UNWIRED,
    connectivity: CONNECTIVITY_UNWIRED,
    serverTime: Date.now(),
  };
}

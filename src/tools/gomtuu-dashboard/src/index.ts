import { loadConfig } from "./config.js";
import { buildSnapshot, createDashboardStores, redactPositionForPublic } from "./dashboardState.js";
import { buildLiveUpdate, createLiveStream } from "./liveStream.js";
import { consoleLogger } from "./logger.js";
import { loadPowerHistory, savePowerHistory } from "./history.js";
import { connectMqtt } from "./mqttClient.js";
import { coarsenPosition } from "./positionState.js";
import { startServer } from "./server.js";
import { loadSolarPeakStore, saveSolarPeakStore } from "./solarPeak.js";
import { summarizePower } from "./victronState.js";
import { startWeatherPoller } from "./weather.js";

const config = loadConfig();
const stores = createDashboardStores(
  loadSolarPeakStore(config.solarPeak.stateFile),
  loadPowerHistory(config.powerHistory.stateFile),
);

function persistPowerHistory(): void {
  try {
    savePowerHistory(stores.powerHistory, config.powerHistory.stateFile);
  } catch (err) {
    consoleLogger.error(`failed to save power history: ${(err as Error).message}`);
  }
}
const historySaveTimer = setInterval(persistPowerHistory, config.powerHistory.saveIntervalMs);

function persistSolarPeak(): void {
  try {
    saveSolarPeakStore(stores.solarPeak, config.solarPeak.stateFile);
  } catch (err) {
    consoleLogger.error(`failed to save solar peak: ${(err as Error).message}`);
  }
}

// The browser polls /snapshot.json for everything (see public/app.js) and
// also listens on /stream for the fast-changing readings. Both read the
// same stores, which MQTT keeps current.
const liveStreamOptions = { ...config.liveStream, logger: consoleLogger };
const server = startServer(
  config,
  consoleLogger,
  () => buildSnapshot(stores),
  () => redactPositionForPublic(buildSnapshot(stores)),
  createLiveStream({ ...liveStreamOptions, getUpdate: () => buildLiveUpdate(summarizePower(stores.victron), stores.position) }),
  createLiveStream({
    ...liveStreamOptions,
    getUpdate: () => buildLiveUpdate(summarizePower(stores.victron), coarsenPosition(stores.position)),
  }),
);

connectMqtt(config, stores, consoleLogger, () => {}, persistSolarPeak);

const weatherPoller = startWeatherPoller(
  () => stores.position,
  (weather) => {
    stores.weather = weather;
  },
  consoleLogger,
  config.weather.pollIntervalMs,
);

function shutDown(): void {
  weatherPoller.stop();
  clearInterval(historySaveTimer);
  persistPowerHistory();
  void server.close().then(() => process.exit(0));
}
process.on("SIGTERM", shutDown);
process.on("SIGINT", shutDown);

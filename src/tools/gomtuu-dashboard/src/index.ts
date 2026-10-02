import { loadConfig } from "./config.js";
import { buildSnapshot, createDashboardStores, redactPositionForPublic } from "./dashboardState.js";
import { consoleLogger } from "./logger.js";
import { connectMqtt } from "./mqttClient.js";
import { startServer } from "./server.js";
import { loadSolarPeakStore, saveSolarPeakStore } from "./solarPeak.js";
import { startWeatherPoller } from "./weather.js";

const config = loadConfig();
const stores = createDashboardStores(loadSolarPeakStore(config.solarPeak.stateFile, config.solarPeak.windowMs));

function persistSolarPeak(): void {
  try {
    saveSolarPeakStore(stores.solarPeak, config.solarPeak.stateFile);
  } catch (err) {
    consoleLogger.error(`failed to save solar peak state: ${(err as Error).message}`);
  }
}
const solarPeakSaver = setInterval(persistSolarPeak, 60 * 1000);

// Polling, not push: the browser fetches /snapshot.json on an interval
// (see public/app.js), so nothing here needs to notify it of changes --
// the stores are just kept current for whenever the next poll lands.
const server = startServer(
  config,
  consoleLogger,
  () => buildSnapshot(stores),
  () => redactPositionForPublic(buildSnapshot(stores)),
);

connectMqtt(config, stores, consoleLogger, () => {});

const weatherPoller = startWeatherPoller(
  () => stores.position,
  (weather) => {
    stores.weather = weather;
  },
  consoleLogger,
  config.weather.pollIntervalMs,
);

process.on("SIGTERM", () => {
  weatherPoller.stop();
  clearInterval(solarPeakSaver);
  persistSolarPeak();
  void server.close().then(() => process.exit(0));
});
process.on("SIGINT", () => {
  weatherPoller.stop();
  clearInterval(solarPeakSaver);
  persistSolarPeak();
  void server.close().then(() => process.exit(0));
});

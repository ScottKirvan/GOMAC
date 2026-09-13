import { loadConfig } from "./config.js";
import { buildSnapshot, createDashboardStores } from "./dashboardState.js";
import { consoleLogger } from "./logger.js";
import { connectMqtt } from "./mqttClient.js";
import { startServer } from "./server.js";
import { startWeatherPoller } from "./weather.js";

const config = loadConfig();
const stores = createDashboardStores();

// Polling, not push: the browser fetches /snapshot.json on an interval
// (see public/app.js), so nothing here needs to notify it of changes --
// the stores are just kept current for whenever the next poll lands.
const server = startServer(config, consoleLogger, () => buildSnapshot(stores));

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
  void server.close().then(() => process.exit(0));
});
process.on("SIGINT", () => {
  weatherPoller.stop();
  void server.close().then(() => process.exit(0));
});

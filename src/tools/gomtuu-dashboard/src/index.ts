import { loadConfig } from "./config.js";
import { buildSnapshot, createDashboardStores } from "./dashboardState.js";
import { consoleLogger } from "./logger.js";
import { connectMqtt } from "./mqttClient.js";
import { startServer } from "./server.js";
import { startWeatherPoller } from "./weather.js";

const config = loadConfig();
const stores = createDashboardStores();

const server = startServer(config, consoleLogger, () => buildSnapshot(stores));

connectMqtt(config, stores, consoleLogger, () => {
  server.broadcast(buildSnapshot(stores));
});

const weatherPoller = startWeatherPoller(
  () => stores.position,
  (weather) => {
    stores.weather = weather;
    server.broadcast(buildSnapshot(stores));
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

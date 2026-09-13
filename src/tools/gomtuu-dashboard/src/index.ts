import { loadConfig } from "./config.js";
import { buildSnapshot, createDashboardStores } from "./dashboardState.js";
import { consoleLogger } from "./logger.js";
import { connectMqtt } from "./mqttClient.js";
import { startServer } from "./server.js";

const config = loadConfig();
const stores = createDashboardStores();

const server = startServer(config, consoleLogger, () => buildSnapshot(stores));

connectMqtt(config, stores, consoleLogger, () => {
  server.broadcast(buildSnapshot(stores));
});

process.on("SIGTERM", () => {
  void server.close().then(() => process.exit(0));
});
process.on("SIGINT", () => {
  void server.close().then(() => process.exit(0));
});

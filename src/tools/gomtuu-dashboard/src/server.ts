import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import type { DashboardConfig } from "./config.js";
import type { Logger } from "./logger.js";
import type { DashboardSnapshot } from "./types.js";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

function serveStatic(urlPath: string, res: import("node:http").ServerResponse): void {
  const safePath = normalize(urlPath === "/" ? "/index.html" : urlPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
    return;
  }

  const contentType = CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": contentType });
  createReadStream(filePath).pipe(res);
}

export interface DashboardServer {
  httpServer: Server;
  broadcast(snapshot: DashboardSnapshot): void;
  close(): Promise<void>;
}

export function startServer(config: DashboardConfig, logger: Logger, getSnapshot: () => DashboardSnapshot): DashboardServer {
  const httpServer = createServer((req, res) => {
    serveStatic(req.url ?? "/", res);
  });

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  const clients = new Set<WebSocket>();

  wss.on("connection", (socket) => {
    clients.add(socket);
    socket.send(JSON.stringify(getSnapshot()));
    socket.on("close", () => clients.delete(socket));
    socket.on("error", () => clients.delete(socket));
  });

  const broadcast = (snapshot: DashboardSnapshot): void => {
    const payload = JSON.stringify(snapshot);
    for (const client of clients) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  };

  httpServer.listen(config.http.port, () => {
    logger.info(`dashboard listening at http://127.0.0.1:${config.http.port}`);
  });

  return {
    httpServer,
    broadcast,
    close: () =>
      new Promise((resolve, reject) => {
        wss.close();
        httpServer.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

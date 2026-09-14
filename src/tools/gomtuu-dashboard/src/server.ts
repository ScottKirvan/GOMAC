import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
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
  close(): Promise<void>;
}

/**
 * Plain polling, not push: the browser fetches GET /snapshot.json on an
 * interval (see public/app.js) instead of holding a WebSocket open.
 * Something still has to hold the live MQTT connection and Open-Meteo
 * poll -- that part can't go away, MQTT is inherently a persistent
 * connection -- but nothing here needs bidirectional transport to the
 * browser, so plain HTTP is enough.
 */
export function startServer(config: DashboardConfig, logger: Logger, getSnapshot: () => DashboardSnapshot): DashboardServer {
  const httpServer = createServer((req, res) => {
    if (req.url === "/snapshot.json") {
      // Wildcard is fine here: read-only, no auth, no cookies -- there's
      // nothing same-origin policy would otherwise be protecting. This is
      // what lets a frontend hosted elsewhere (e.g. GitHub Pages) poll a
      // copy of this service exposed publicly (e.g. via Tailscale Funnel).
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
      });
      res.end(JSON.stringify(getSnapshot()));
      return;
    }
    serveStatic(req.url ?? "/", res);
  });

  httpServer.listen(config.http.port, () => {
    logger.info(`dashboard listening at http://127.0.0.1:${config.http.port}`);
  });

  return {
    httpServer,
    close: () => new Promise((resolve, reject) => httpServer.close((err) => (err ? reject(err) : resolve()))),
  };
}

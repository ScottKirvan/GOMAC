import { describe, expect, it } from "vitest";
import type { Logger } from "../src/logger.js";
import { createReconnectWatch } from "../src/mqttClient.js";

function recordingLogger() {
  const warnings: string[] = [];
  const logger: Logger = { info() {}, error() {}, warn: (m) => warnings.push(m) };
  return { logger, warnings };
}

describe("createReconnectWatch", () => {
  it("warns once when connections keep closing right after they open", () => {
    const { logger, warnings } = recordingLogger();
    const watch = createReconnectWatch(logger, "gomac-dashboard-x");
    let t = 0;
    for (let i = 0; i < 6; i++) {
      watch.connected(t);
      watch.closed(t + 500);
      t += 1000;
    }
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("gomac-dashboard-x");
  });

  it("stays quiet for an occasional reconnect after a stable connection", () => {
    const { logger, warnings } = recordingLogger();
    const watch = createReconnectWatch(logger, "id");
    watch.connected(0);
    watch.closed(600_000);
    watch.connected(601_000);
    watch.closed(1_200_000);
    expect(warnings).toHaveLength(0);
  });

  it("warns again after a stable stretch if the pattern comes back", () => {
    const { logger, warnings } = recordingLogger();
    const watch = createReconnectWatch(logger, "id");
    const storm = (start: number) => {
      for (let i = 0; i < 3; i++) {
        watch.connected(start + i * 1000);
        watch.closed(start + i * 1000 + 200);
      }
    };
    storm(0);
    watch.connected(10_000);
    watch.closed(700_000);
    storm(800_000);
    expect(warnings).toHaveLength(2);
  });
});

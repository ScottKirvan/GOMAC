import { isTier1Action, TIER1_KEYSTROKES } from "./commands.js";
import { writeFifoKey } from "./fifoWriter.js";
import type { Logger } from "./logger.js";
import type { PianobarProcessManager } from "./processManager.js";
import type { StationDirectory } from "./stationDirectory.js";

export interface CommandPayload {
  action?: unknown;
  station?: unknown;
}

export interface CommandHandlerDeps {
  fifoPath: string;
  processManager: Pick<PianobarProcessManager, "restart">;
  stationDirectory: Pick<StationDirectory, "getStations">;
  logger: Logger;
  writeKey?: typeof writeFifoKey;
}

/**
 * Case-insensitive exact match against the most recently known station
 * list (see telemetry.ts's parseStationList doc comment for why this
 * list's index order is safe to feed back into pianobar's `s` prompt).
 */
export function findStationIndex(stations: string[] | undefined, name: string): number | undefined {
  if (stations === undefined) {
    return undefined;
  }
  const target = name.trim().toLowerCase();
  const index = stations.findIndex((station) => station.toLowerCase() === target);
  return index === -1 ? undefined : index;
}

export function parseCommandPayload(raw: Buffer | string): CommandPayload {
  const text = typeof raw === "string" ? raw : raw.toString("utf8");
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("command payload must be a JSON object");
  }
  return parsed as CommandPayload;
}

export async function handleCommand(payload: CommandPayload, deps: CommandHandlerDeps): Promise<void> {
  const { action } = payload;
  if (typeof action !== "string" || action.length === 0) {
    deps.logger.warn(`ignoring command with missing/invalid "action": ${JSON.stringify(payload)}`);
    return;
  }

  if (action === "restart") {
    deps.logger.info("restarting pianobar");
    await deps.processManager.restart();
    return;
  }

  if (action === "select_source") {
    await handleSelectSource(payload, deps);
    return;
  }

  if (!isTier1Action(action)) {
    deps.logger.warn(`ignoring unsupported action "${action}"`);
    return;
  }

  const key = TIER1_KEYSTROKES[action];
  const write = deps.writeKey ?? writeFifoKey;
  try {
    await write(deps.fifoPath, key);
    deps.logger.info(`wrote "${key}" to fifo for action "${action}"`);
  } catch (err) {
    deps.logger.error(`failed to write "${key}" to fifo for action "${action}": ${(err as Error).message}`);
  }
}

/**
 * pianobar's `s` prompt expects a station number typed as a follow-up line
 * (see pandora-mqtt-spec.md's Tier 2 row), with no way to read its response
 * back through the one-way FIFO to confirm before sending. Both keystrokes
 * are written as a single `write()` call ("s<N>\n") rather than two
 * separate ones so this stays atomic against pianobar-mpris-bridge.py's
 * concurrent single-character writes to the same FIFO -- two separate
 * writes could have one of its keystrokes land in between them.
 */
async function handleSelectSource(payload: CommandPayload, deps: CommandHandlerDeps): Promise<void> {
  const { station } = payload;
  if (typeof station !== "string" || station.trim().length === 0) {
    deps.logger.warn(`ignoring select_source with missing/invalid "station": ${JSON.stringify(payload)}`);
    return;
  }

  const stations = deps.stationDirectory.getStations();
  const index = findStationIndex(stations, station);
  if (index === undefined) {
    const reason = stations === undefined ? "no station list received yet" : "not found in the most recently known station list";
    deps.logger.warn(`cannot select station "${station}": ${reason}`);
    return;
  }

  const write = deps.writeKey ?? writeFifoKey;
  const keystroke = `s${index}\n`;
  try {
    await write(deps.fifoPath, keystroke);
    deps.logger.info(`selected station "${station}" (index ${index}) via fifo`);
  } catch (err) {
    deps.logger.error(`failed to select station "${station}": ${(err as Error).message}`);
  }
}

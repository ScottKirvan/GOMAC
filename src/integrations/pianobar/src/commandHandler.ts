import { isTier1Action, TIER1_KEYSTROKES } from "./commands.js";
import { writeFifoKey } from "./fifoWriter.js";
import type { Logger } from "./logger.js";
import type { PianobarProcessManager } from "./processManager.js";

export interface CommandPayload {
  action?: unknown;
}

export interface CommandHandlerDeps {
  fifoPath: string;
  processManager: Pick<PianobarProcessManager, "restart">;
  logger: Logger;
  writeKey?: typeof writeFifoKey;
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

import { execFileSync } from "node:child_process";
import { constants, existsSync, mkdirSync, statSync } from "node:fs";
import { open } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * pianobar never creates its control FIFO itself -- per `man pianobar`,
 * that's a manual `mkfifo` step. Since the daemon now owns pianobar's
 * whole environment (see Process Ownership in pandora-mqtt-spec.md), it
 * has to do that step itself rather than relying on it having been done
 * by hand previously.
 */
export function ensureFifo(fifoPath: string): void {
  mkdirSync(dirname(fifoPath), { recursive: true });
  if (existsSync(fifoPath)) {
    if (!statSync(fifoPath).isFIFO()) {
      throw new Error(`expected a FIFO at "${fifoPath}", but a non-FIFO file already exists there`);
    }
    return;
  }
  execFileSync("mkfifo", ["-m", "600", fifoPath]);
}

/**
 * Opening a FIFO for write blocks until a reader opens it too, unless
 * O_NONBLOCK is set -- in which case, with no reader present, it fails fast
 * with ENXIO instead of hanging forever. Preferred over a blocking open
 * since a stuck/dead pianobar shouldn't wedge the daemon's command handling.
 */
export async function writeFifoKey(fifoPath: string, key: string): Promise<void> {
  const handle = await open(fifoPath, constants.O_WRONLY | constants.O_NONBLOCK);
  try {
    await handle.write(key, null, "utf8");
  } finally {
    await handle.close();
  }
}

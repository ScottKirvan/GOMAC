import { constants } from "node:fs";
import { open } from "node:fs/promises";

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

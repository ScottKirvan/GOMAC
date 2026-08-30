import { spawn as nodeSpawn } from "node:child_process";
import { dirname } from "node:path";
import type { DaemonConfig } from "./config.js";
import { clearPid, isProcessAlive as nodeIsProcessAlive, readPid, writePid } from "./pidfile.js";

export interface SpawnedProcess {
  pid: number;
}

export interface ProcessOps {
  spawnDetached(command: string, args: string[], env: NodeJS.ProcessEnv): SpawnedProcess;
  isAlive(pid: number): boolean;
  kill(pid: number, signal: NodeJS.Signals): void;
  sleep(ms: number): Promise<void>;
}

export const nodeProcessOps: ProcessOps = {
  spawnDetached(command, args, env) {
    const child = nodeSpawn(command, args, {
      detached: true,
      stdio: "ignore",
      env,
    });
    child.unref();
    if (child.pid === undefined) {
      throw new Error(`Failed to spawn "${command}": no pid was assigned`);
    }
    return { pid: child.pid };
  },
  isAlive: nodeIsProcessAlive,
  kill(pid, signal) {
    process.kill(pid, signal);
  },
  sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  },
};

/**
 * pianobar has no flag to point it at an arbitrary config file -- it only
 * ever reads "$XDG_CONFIG_HOME/pianobar/config" (falling back to
 * ~/.config/pianobar/config). Managed configPath is therefore expected to
 * end in ".../pianobar/config"; the daemon derives XDG_CONFIG_HOME from it
 * so a non-default configPath still lands where pianobar will look.
 */
function xdgConfigHomeFor(pianobarConfigPath: string): string {
  return dirname(dirname(pianobarConfigPath));
}

export class PianobarProcessManager {
  private pid: number | undefined;

  constructor(
    private readonly config: DaemonConfig,
    private readonly ops: ProcessOps = nodeProcessOps,
  ) {}

  get currentPid(): number | undefined {
    return this.pid;
  }

  /** Startup entry point: reattach to an already-running owned pianobar, or spawn a fresh one. */
  adoptOrSpawn(): number {
    const existingPid = readPid(this.config.pidFilePath);
    if (existingPid !== undefined && this.ops.isAlive(existingPid)) {
      this.pid = existingPid;
      return existingPid;
    }
    return this.spawn();
  }

  async restart(): Promise<number> {
    if (this.pid !== undefined && this.ops.isAlive(this.pid)) {
      await this.stop(this.pid);
    }
    clearPid(this.config.pidFilePath);
    return this.spawn();
  }

  private spawn(): number {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      XDG_CONFIG_HOME: xdgConfigHomeFor(this.config.pianobar.configPath),
    };
    const { pid } = this.ops.spawnDetached(this.config.pianobar.binary, [], env);
    this.pid = pid;
    writePid(this.config.pidFilePath, pid);
    return pid;
  }

  /** SIGTERM, then escalate to SIGKILL if pianobar hasn't exited within the configured timeout -- see Process Ownership in pandora-mqtt-spec.md. */
  private async stop(pid: number): Promise<void> {
    this.ops.kill(pid, "SIGTERM");

    const pollIntervalMs = 200;
    const deadline = Date.now() + this.config.restartSigtermTimeoutMs;
    while (Date.now() < deadline) {
      if (!this.ops.isAlive(pid)) {
        return;
      }
      await this.ops.sleep(pollIntervalMs);
    }

    if (this.ops.isAlive(pid)) {
      this.ops.kill(pid, "SIGKILL");
    }
  }
}

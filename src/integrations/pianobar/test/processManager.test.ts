import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DaemonConfig } from "../src/config.js";
import { readPid } from "../src/pidfile.js";
import { type ProcessOps, PianobarProcessManager } from "../src/processManager.js";

function baseConfig(dir: string): DaemonConfig {
  return {
    mqtt: {
      host: "127.0.0.1",
      port: 1883,
      clientId: "test",
      commandTopic: "gomac/pandora/cmd",
      availabilityTopic: "gomac/pandora/availability",
    },
    pianobar: {
      binary: "pianobar",
      configPath: join(dir, "xdg", "pianobar", "config"),
      fifoPath: join(dir, "ctl"),
      eventCommandPath: join(dir, "eventcmd.sh"),
    },
    pidFilePath: join(dir, "pianobar.pid"),
    restartSigtermTimeoutMs: 50,
  };
}

function fakeOps(overrides: Partial<ProcessOps> = {}): ProcessOps & { spawnDetached: ReturnType<typeof vi.fn> } {
  const spawnDetached = vi.fn().mockReturnValue({ pid: 111 });
  return {
    spawnDetached,
    isAlive: vi.fn().mockReturnValue(false),
    kill: vi.fn(),
    sleep: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("PianobarProcessManager", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gomac-pianobar-processmanager-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("spawns a fresh pianobar when no pidfile exists", () => {
    const config = baseConfig(dir);
    const ops = fakeOps();
    const manager = new PianobarProcessManager(config, ops);

    const pid = manager.adoptOrSpawn();

    expect(pid).toBe(111);
    expect(ops.spawnDetached).toHaveBeenCalledOnce();
    expect(readPid(config.pidFilePath)).toBe(111);
  });

  it("derives XDG_CONFIG_HOME from the managed pianobar config path when spawning", () => {
    const config = baseConfig(dir);
    const ops = fakeOps();
    const manager = new PianobarProcessManager(config, ops);

    manager.adoptOrSpawn();

    const [, , env] = ops.spawnDetached.mock.calls[0] as [string, string[], NodeJS.ProcessEnv];
    expect(env.XDG_CONFIG_HOME).toBe(join(dir, "xdg"));
  });

  it("adopts an already-running pianobar instead of spawning a duplicate", () => {
    const config = baseConfig(dir);
    const ops = fakeOps({ isAlive: vi.fn().mockReturnValue(true) });
    // Simulate a pidfile left behind by a previous daemon run.
    new PianobarProcessManager(config, fakeOps()).adoptOrSpawn();
    const spawnCallsBefore = (ops.spawnDetached as ReturnType<typeof vi.fn>).mock.calls.length;

    const manager = new PianobarProcessManager(config, ops);
    const pid = manager.adoptOrSpawn();

    expect(pid).toBe(111);
    expect(ops.spawnDetached.mock.calls.length).toBe(spawnCallsBefore);
  });

  it("restart sends SIGTERM, waits for exit, and spawns a new process", async () => {
    const config = baseConfig(dir);
    let aliveAfterTerm = true;
    const ops = fakeOps({
      isAlive: vi.fn(() => aliveAfterTerm),
      kill: vi.fn((_pid, signal) => {
        if (signal === "SIGTERM") {
          aliveAfterTerm = false;
        }
      }),
    });
    const manager = new PianobarProcessManager(config, ops);
    manager.adoptOrSpawn();

    const newPid = await manager.restart();

    expect(ops.kill).toHaveBeenCalledWith(111, "SIGTERM");
    expect(ops.kill).not.toHaveBeenCalledWith(expect.anything(), "SIGKILL");
    expect(newPid).toBe(111);
    expect(ops.spawnDetached).toHaveBeenCalledTimes(2);
  });

  it("escalates to SIGKILL if pianobar does not exit before the configured timeout", async () => {
    const config = baseConfig(dir);
    const ops = fakeOps({ isAlive: vi.fn().mockReturnValue(true) });
    const manager = new PianobarProcessManager(config, ops);
    manager.adoptOrSpawn();

    await manager.restart();

    expect(ops.kill).toHaveBeenCalledWith(111, "SIGTERM");
    expect(ops.kill).toHaveBeenCalledWith(111, "SIGKILL");
  });

  it("restart spawns fresh even if no process was previously known", async () => {
    const config = baseConfig(dir);
    const ops = fakeOps();
    const manager = new PianobarProcessManager(config, ops);

    await manager.restart();

    expect(ops.kill).not.toHaveBeenCalled();
    expect(ops.spawnDetached).toHaveBeenCalledOnce();
  });
});

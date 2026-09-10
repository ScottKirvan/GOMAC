import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DaemonConfig } from "../src/config.js";
import { readPid } from "../src/pidfile.js";
import { nodeProcessOps, type ProcessOps, PianobarProcessManager } from "../src/processManager.js";

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
    isExpectedProcess: vi.fn().mockReturnValue(true),
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

  it("spawns fresh instead of adopting when the pidfile's pid has been reused by an unrelated process", () => {
    const config = baseConfig(dir);
    new PianobarProcessManager(config, fakeOps()).adoptOrSpawn();

    const ops = fakeOps({
      isAlive: vi.fn().mockReturnValue(true),
      isExpectedProcess: vi.fn().mockReturnValue(false),
    });
    const manager = new PianobarProcessManager(config, ops);

    manager.adoptOrSpawn();

    expect(ops.spawnDetached).toHaveBeenCalledOnce();
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

  it("adoptIfRunning does not spawn when no pidfile exists", () => {
    const config = baseConfig(dir);
    const ops = fakeOps();
    const manager = new PianobarProcessManager(config, ops);

    const pid = manager.adoptIfRunning();

    expect(pid).toBeUndefined();
    expect(ops.spawnDetached).not.toHaveBeenCalled();
  });

  it("adoptIfRunning reattaches to an already-running owned pianobar without spawning", () => {
    const config = baseConfig(dir);
    new PianobarProcessManager(config, fakeOps()).adoptOrSpawn();

    const ops = fakeOps({ isAlive: vi.fn().mockReturnValue(true) });
    const manager = new PianobarProcessManager(config, ops);

    const pid = manager.adoptIfRunning();

    expect(pid).toBe(111);
    expect(ops.spawnDetached).not.toHaveBeenCalled();
  });

  it("isRunning reflects an owned alive process without adopting or spawning", () => {
    const config = baseConfig(dir);
    new PianobarProcessManager(config, fakeOps()).adoptOrSpawn();

    const ops = fakeOps({ isAlive: vi.fn().mockReturnValue(true) });
    const manager = new PianobarProcessManager(config, ops);

    expect(manager.isRunning()).toBe(true);
    expect(ops.spawnDetached).not.toHaveBeenCalled();
  });

  it("isRunning is false when nothing owned is alive", () => {
    const config = baseConfig(dir);
    const manager = new PianobarProcessManager(config, fakeOps());

    expect(manager.isRunning()).toBe(false);
  });
});

describe("nodeProcessOps.isExpectedProcess", () => {
  it("matches the real running process against its own executable name", () => {
    expect(nodeProcessOps.isExpectedProcess(process.pid, process.execPath)).toBe(true);
  });

  it("returns false for a pid that does not exist", () => {
    expect(nodeProcessOps.isExpectedProcess(999_999, "pianobar")).toBe(false);
  });

  it("returns false when the running process's name does not match", () => {
    expect(nodeProcessOps.isExpectedProcess(process.pid, "pianobar")).toBe(false);
  });

  it("still matches a configured binary name longer than the kernel's 15-char comm limit", async () => {
    // Regression test: found live during this daemon's own acceptance
    // testing against a 16-character stand-in binary name, which the
    // kernel truncates in /proc/<pid>/comm -- a naive untruncated
    // comparison never matches, wrongly treating a live, correctly-named
    // process as unrecognized.
    const dir = mkdtempSync(join(tmpdir(), "gomac-pianobar-longname-"));
    const scriptPath = join(dir, "a-sixteen-char-x"); // 16 chars, one over the limit
    writeFileSync(scriptPath, "#!/bin/sh\nsleep 5\n", { mode: 0o755 });
    const child = spawn(scriptPath, [], { stdio: "ignore" });
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(nodeProcessOps.isExpectedProcess(child.pid as number, scriptPath)).toBe(true);
    } finally {
      child.kill();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

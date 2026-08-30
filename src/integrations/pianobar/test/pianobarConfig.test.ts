import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensurePianobarConfig, renderManagedPianobarConfig } from "../src/pianobarConfig.js";

describe("renderManagedPianobarConfig", () => {
  it("appends managed keys to an empty config", () => {
    const result = renderManagedPianobarConfig("", { fifo: "/tmp/ctl", eventCommand: "/tmp/eventcmd.sh" });

    expect(result).toBe("fifo = /tmp/ctl\nevent_command = /tmp/eventcmd.sh\n");
  });

  it("preserves unrelated lines, including credentials, untouched", () => {
    const existing = ["user = someone@example.com", "password = hunter2", "control_proxy = http://127.0.0.1:8118/"].join(
      "\n",
    );

    const result = renderManagedPianobarConfig(existing, { fifo: "/tmp/ctl", eventCommand: "/tmp/eventcmd.sh" });

    expect(result).toContain("user = someone@example.com");
    expect(result).toContain("password = hunter2");
    expect(result).toContain("control_proxy = http://127.0.0.1:8118/");
    expect(result).toContain("fifo = /tmp/ctl");
    expect(result).toContain("event_command = /tmp/eventcmd.sh");
  });

  it("overwrites an existing managed key in place rather than duplicating it", () => {
    const existing = ["user = someone@example.com", "fifo = /old/path/ctl", "password = hunter2"].join("\n");

    const result = renderManagedPianobarConfig(existing, { fifo: "/new/path/ctl", eventCommand: "/tmp/eventcmd.sh" });

    const fifoLines = result.split("\n").filter((line) => line.startsWith("fifo"));
    expect(fifoLines).toEqual(["fifo = /new/path/ctl"]);
    expect(result).toContain("user = someone@example.com");
    expect(result).toContain("password = hunter2");
  });

  it("is idempotent when run twice with the same settings", () => {
    const settings = { fifo: "/tmp/ctl", eventCommand: "/tmp/eventcmd.sh" };
    const existing = "user = someone@example.com\n";

    const once = renderManagedPianobarConfig(existing, settings);
    const twice = renderManagedPianobarConfig(once, settings);

    expect(twice).toBe(once);
  });
});

describe("ensurePianobarConfig", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gomac-pianobar-configfile-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates the config file and its parent directory when neither exists", () => {
    const configPath = join(dir, "nested", "pianobar", "config");

    ensurePianobarConfig(configPath, { fifo: "/tmp/ctl", eventCommand: "/tmp/eventcmd.sh" });

    const contents = readFileSync(configPath, "utf8");
    expect(contents).toContain("fifo = /tmp/ctl");
    expect(contents).toContain("event_command = /tmp/eventcmd.sh");
  });

  it("preserves an existing file's other settings when updating it", () => {
    const configPath = join(dir, "config");
    writeFileSync(configPath, "user = someone@example.com\npassword = hunter2\n");

    ensurePianobarConfig(configPath, { fifo: "/tmp/ctl", eventCommand: "/tmp/eventcmd.sh" });

    const contents = readFileSync(configPath, "utf8");
    expect(contents).toContain("user = someone@example.com");
    expect(contents).toContain("password = hunter2");
    expect(contents).toContain("fifo = /tmp/ctl");
  });
});

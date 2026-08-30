import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureEventCommandScript } from "../src/eventCommand.js";

describe("ensureEventCommandScript", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gomac-pianobar-eventcmd-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates an executable placeholder script when none exists", () => {
    const scriptPath = join(dir, "nested", "eventcmd.sh");

    ensureEventCommandScript(scriptPath);

    const mode = statSync(scriptPath).mode & 0o777;
    expect(mode).toBe(0o755);
    expect(readFileSync(scriptPath, "utf8")).toContain("exit 0");
  });

  it("does not overwrite an existing script's contents", () => {
    const scriptPath = join(dir, "eventcmd.sh");
    writeFileSync(scriptPath, "#!/bin/sh\necho custom\n", { mode: 0o644 });

    ensureEventCommandScript(scriptPath);

    expect(readFileSync(scriptPath, "utf8")).toContain("echo custom");
  });

  it("still ensures the executable bit on a pre-existing non-executable script", () => {
    const scriptPath = join(dir, "eventcmd.sh");
    writeFileSync(scriptPath, "#!/bin/sh\necho custom\n", { mode: 0o644 });

    ensureEventCommandScript(scriptPath);

    const mode = statSync(scriptPath).mode & 0o777;
    expect(mode).toBe(0o755);
  });
});

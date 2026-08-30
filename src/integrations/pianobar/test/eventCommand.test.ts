import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureEventCommandScript, renderEventCommandScript } from "../src/eventCommand.js";

describe("renderEventCommandScript", () => {
  it("execs via npx tsx for a .ts runner path (dev/tsx workflow)", () => {
    const script = renderEventCommandScript("/repo/src/eventCommandRunner.ts");
    expect(script).toBe('#!/bin/sh\nexec npx --no-install tsx "/repo/src/eventCommandRunner.ts" "$@"\n');
  });

  it("execs via plain node for a compiled .js runner path", () => {
    const script = renderEventCommandScript("/repo/dist/eventCommandRunner.js");
    expect(script).toBe('#!/bin/sh\nexec node "/repo/dist/eventCommandRunner.js" "$@"\n');
  });

  it("forwards pianobar's own argv through to the runner", () => {
    expect(renderEventCommandScript("/x/eventCommandRunner.js")).toContain('"$@"');
  });
});

describe("ensureEventCommandScript", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gomac-pianobar-eventcmd-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates an executable script pointing at the given runner", () => {
    const scriptPath = join(dir, "nested", "eventcmd.sh");
    const runnerPath = join(dir, "eventCommandRunner.js");

    ensureEventCommandScript(scriptPath, runnerPath);

    const mode = statSync(scriptPath).mode & 0o777;
    expect(mode).toBe(0o755);
    expect(readFileSync(scriptPath, "utf8")).toContain(runnerPath);
  });

  it("always regenerates the script to match the current runner path, even if one already exists", () => {
    const scriptPath = join(dir, "eventcmd.sh");

    ensureEventCommandScript(scriptPath, join(dir, "old-runner.js"));
    ensureEventCommandScript(scriptPath, join(dir, "new-runner.js"));

    const contents = readFileSync(scriptPath, "utf8");
    expect(contents).toContain("new-runner.js");
    expect(contents).not.toContain("old-runner.js");
  });
});

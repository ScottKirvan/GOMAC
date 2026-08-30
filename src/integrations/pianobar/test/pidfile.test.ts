import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearPid, isProcessAlive, readPid, writePid } from "../src/pidfile.js";

describe("pidfile read/write/clear", () => {
  let dir: string;
  let pidFilePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gomac-pianobar-pidfile-"));
    pidFilePath = join(dir, "nested", "pianobar.pid");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns undefined when the pidfile does not exist", () => {
    expect(readPid(pidFilePath)).toBeUndefined();
  });

  it("round-trips a written pid, creating parent directories as needed", () => {
    writePid(pidFilePath, 4321);

    expect(readFileSync(pidFilePath, "utf8")).toBe("4321\n");
    expect(readPid(pidFilePath)).toBe(4321);
  });

  it("treats non-numeric or non-positive contents as absent", () => {
    mkdirSync(join(dir, "nested"), { recursive: true });

    writeFileSync(pidFilePath, "not-a-pid\n");
    expect(readPid(pidFilePath)).toBeUndefined();

    writeFileSync(pidFilePath, "-4\n");
    expect(readPid(pidFilePath)).toBeUndefined();
  });

  it("removes an existing pidfile", () => {
    writePid(pidFilePath, 42);
    clearPid(pidFilePath);
    expect(readPid(pidFilePath)).toBeUndefined();
  });

  it("clearPid is a no-op when the file does not exist", () => {
    expect(() => clearPid(pidFilePath)).not.toThrow();
  });
});

describe("isProcessAlive", () => {
  it("returns true when the kill probe succeeds", () => {
    expect(isProcessAlive(123, () => undefined)).toBe(true);
  });

  it("returns false when the kill probe reports ESRCH (no such process)", () => {
    const probe = () => {
      const err = Object.assign(new Error("no such process"), { code: "ESRCH" });
      throw err;
    };
    expect(isProcessAlive(123, probe)).toBe(false);
  });

  it("returns true when the kill probe reports EPERM (process exists, not permitted to signal)", () => {
    const probe = () => {
      const err = Object.assign(new Error("not permitted"), { code: "EPERM" });
      throw err;
    };
    expect(isProcessAlive(123, probe)).toBe(true);
  });
});

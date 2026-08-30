import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function readPid(pidFilePath: string): number | undefined {
  if (!existsSync(pidFilePath)) {
    return undefined;
  }
  const raw = readFileSync(pidFilePath, "utf8").trim();
  const pid = Number(raw);
  return Number.isInteger(pid) && pid > 0 ? pid : undefined;
}

export function writePid(pidFilePath: string, pid: number): void {
  mkdirSync(dirname(pidFilePath), { recursive: true });
  writeFileSync(pidFilePath, `${pid}\n`);
}

export function clearPid(pidFilePath: string): void {
  if (existsSync(pidFilePath)) {
    unlinkSync(pidFilePath);
  }
}

type KillProbe = (pid: number, signal: 0) => void;

/**
 * kill(pid, 0) throws ESRCH when no such process exists, and EPERM when the
 * process exists but signaling it isn't permitted -- both distinguishable
 * from "not alive" only by errno, hence the explicit code check rather than
 * a bare try/catch.
 */
export function isProcessAlive(pid: number, killProbe: KillProbe = (p, s) => process.kill(p, s)): boolean {
  try {
    killProbe(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

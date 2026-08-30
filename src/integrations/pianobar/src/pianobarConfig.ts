import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface ManagedPianobarSettings {
  fifo: string;
  eventCommand: string;
  autostartStationId: string;
}

const MANAGED_KEYS = ["fifo", "event_command", "autostart_station"] as const;
type ManagedKey = (typeof MANAGED_KEYS)[number];

function managedLineFor(settings: ManagedPianobarSettings): Record<ManagedKey, string> {
  return {
    fifo: `fifo = ${settings.fifo}`,
    event_command: `event_command = ${settings.eventCommand}`,
    autostart_station: `autostart_station = ${settings.autostartStationId}`,
  };
}

function matchedManagedKey(line: string): ManagedKey | undefined {
  const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=/);
  if (!match) {
    return undefined;
  }
  return MANAGED_KEYS.find((key) => key === match[1]);
}

/**
 * Rewrites only the `fifo` / `event_command` / `autostart_station` lines
 * this daemon owns, leaving every other line (crucially: pianobar's stored
 * credentials) untouched. Pure function so the merge logic is testable
 * without touching disk.
 *
 * `autostart_station` earns its place here for a reason discovered during
 * this daemon's own live acceptance testing, not assumed up front: without
 * it, pianobar doesn't play anything on login at all -- it sits at an
 * interactive numbered station-selection prompt instead. That silently
 * defeats the whole point of the `restart` command (Process Ownership):
 * restarting to recover from a lockup would leave music stopped, not
 * resumed. pianobar has no "resume last station" mode -- `event_command`
 * never exposes a station's raw ID (only its display name), and the only
 * place a station ID is ever printed is pianobar's own interactive
 * stdout, which this daemon deliberately doesn't capture (see Process
 * Ownership's stdio handling) -- so a fixed default is configured instead
 * of a dynamically-remembered one.
 */
export function renderManagedPianobarConfig(existingContents: string, settings: ManagedPianobarSettings): string {
  const lines = existingContents.length > 0 ? existingContents.split(/\r?\n/) : [];
  const lineFor = managedLineFor(settings);
  const seen = new Set<ManagedKey>();

  const rewritten = lines.map((line) => {
    const key = matchedManagedKey(line);
    if (key === undefined) {
      return line;
    }
    seen.add(key);
    return lineFor[key];
  });

  while (rewritten.length > 0 && rewritten[rewritten.length - 1] === "") {
    rewritten.pop();
  }

  for (const key of MANAGED_KEYS) {
    if (!seen.has(key)) {
      rewritten.push(lineFor[key]);
    }
  }

  return `${rewritten.join("\n")}\n`;
}

export function ensurePianobarConfig(configPath: string, settings: ManagedPianobarSettings): void {
  mkdirSync(dirname(configPath), { recursive: true });
  const existing = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
  const next = renderManagedPianobarConfig(existing, settings);
  if (next !== existing) {
    writeFileSync(configPath, next, { mode: 0o600 });
  }
}

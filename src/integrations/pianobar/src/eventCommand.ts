import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const PLACEHOLDER_SCRIPT = `#!/bin/sh
# Managed by the GOMAC pianobar daemon. Phase 1 does not consume telemetry
# events yet (see notes/dev/bridge-daemon-spec.md); this is a no-op so
# pianobar has a valid, executable event_command from the moment the daemon
# spawns it, per the Process Ownership section of pandora-mqtt-spec.md.
exit 0
`;

export function ensureEventCommandScript(scriptPath: string): void {
  mkdirSync(dirname(scriptPath), { recursive: true });
  if (!existsSync(scriptPath)) {
    writeFileSync(scriptPath, PLACEHOLDER_SCRIPT, { mode: 0o755 });
  }
  chmodSync(scriptPath, 0o755);
}

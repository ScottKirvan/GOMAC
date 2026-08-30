import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * pianobar execs `event_command` directly (`man pianobar`) with the event
 * name as argv[1] and `key=value` data on stdin -- it has no shell of its
 * own involved. This wrapper script is the thing pianobar actually execs;
 * it just re-execs the real runner (`eventCommandRunner.ts`/`.js`) so
 * stdin/argv pass through untouched. Choosing `npx --no-install tsx` for a
 * `.ts` runner path (matching Phase 1's `npm run dev` / tsx-only workflow,
 * no build step required) vs. plain `node` for a compiled `.js` path
 * (matching `npm run build` + `node dist/index.js`) keeps this consistent
 * with how the daemon itself is already run -- see index.ts, which derives
 * runnerPath from its own `import.meta.url` so this always matches whichever
 * mode the daemon process itself is running under.
 */
export function renderEventCommandScript(runnerPath: string): string {
  const command = runnerPath.endsWith(".ts") ? `npx --no-install tsx "${runnerPath}"` : `node "${runnerPath}"`;
  return `#!/bin/sh\nexec ${command} "$@"\n`;
}

export function ensureEventCommandScript(scriptPath: string, runnerPath: string): void {
  mkdirSync(dirname(scriptPath), { recursive: true });
  writeFileSync(scriptPath, renderEventCommandScript(runnerPath), { mode: 0o755 });
  chmodSync(scriptPath, 0o755);
}

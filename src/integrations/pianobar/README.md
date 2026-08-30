# GOMAC Pianobar Daemon

A standalone Node/TypeScript daemon that owns pianobar's process lifecycle
and exposes its Tier 1 command surface over MQTT, per the shared
conventions in `notes/dev/bridge-daemon-spec.md` and the daemon-specific
design in `notes/pandora-mqtt-spec.md` (in this directory).

**This is a Phase 1 implementation.** It spawns and owns pianobar, connects
to MQTT under its own identity, and drives every Tier 1 keystroke action
plus `restart`. It does **not** yet consume `event_command` telemetry,
publish Home Assistant discovery, or support station selection (Tier 2) —
see "Development Phases" in the spec for what comes later.

## What it does

- Spawns `pianobar` as a detached child process (survives the daemon's own
  restarts) and tracks it via a pidfile.
- Generates/manages pianobar's own config file, setting only the `fifo` and
  `event_command` keys it needs — every other line (crucially, Pandora
  credentials) is left untouched if the file already exists.
- Writes a no-op placeholder `event_command` script so pianobar has a valid,
  executable one from the moment it's spawned (Phase 2 will make this script
  actually publish telemetry; Phase 1 doesn't consume events at all).
- Connects to a local MQTT broker under its own scoped identity, subscribes
  to `gomac/pandora/cmd`, and for each `{"action": "<name>"}` message either
  writes the corresponding single keystroke to pianobar's control FIFO
  (Tier 1 actions) or performs a managed restart (`restart`).

## Configuration

All configuration is external — nothing is hardcoded, and no credentials
live in this repo. Configure via environment variables, an optional JSON
config file, or both (env vars always win).

| Env var | Default | Notes |
|---|---|---|
| `MQTT_HOST` | `127.0.0.1` | |
| `MQTT_PORT` | `1883` | |
| `MQTT_USERNAME` | *(none)* | This daemon's own scoped MQTT identity — provisioned outside this repo. |
| `MQTT_PASSWORD` | *(none)* | Plaintext password, if you'd rather not use a file. |
| `MQTT_PASSWORD_FILE` | *(none)* | Path to a file containing just the password. Preferred over `MQTT_PASSWORD` for anything beyond local testing; read once at startup. |
| `MQTT_CLIENT_ID` | `gomac-pianobar-daemon` | |
| `MQTT_COMMAND_TOPIC` | `gomac/pandora/cmd` | Per the bridge-daemon-spec topic convention; only override for testing. |
| `MQTT_AVAILABILITY_TOPIC` | `gomac/pandora/availability` | Retained birth/LWT topic — published `online` on connect, `offline` as the broker's last will. |
| `PIANOBAR_BINARY` | `pianobar` | Resolved via `PATH` unless given an absolute path. |
| `PIANOBAR_CONFIG_PATH` | `~/.config/pianobar/config` | The pianobar config file this daemon manages. **Must end in `.../pianobar/config`** — see "Why `PIANOBAR_CONFIG_PATH` has that shape" below. |
| `PIANOBAR_FIFO_PATH` | `~/.config/pianobar/ctl` | Kept as pianobar's existing default so `pianobar-mpris-bridge.py` (which writes to this same path) keeps working unmodified. |
| `PIANOBAR_EVENT_COMMAND_PATH` | `~/.local/state/gomac-pianobar/eventcmd.sh` | Owned entirely by this daemon; safe to point anywhere. |
| `PIANOBAR_PIDFILE_PATH` | `~/.local/state/gomac-pianobar/pianobar.pid` | |
| `RESTART_SIGTERM_TIMEOUT_MS` | `5000` | How long `restart` waits after `SIGTERM` before escalating to `SIGKILL`. |
| `GOMAC_PIANOBAR_CONFIG_FILE` | *(none)* | Optional path to a JSON file providing any of the above as defaults (env vars still take precedence). Shape: `{"mqtt": {...}, "pianobar": {...}, "pidFilePath": "...", "restartSigtermTimeoutMs": ...}` — see `src/config.ts` for the exact keys. |

### Why `PIANOBAR_CONFIG_PATH` has that shape

pianobar has no flag to point it at an arbitrary config file — it only ever
reads `$XDG_CONFIG_HOME/pianobar/config` (falling back to
`~/.config/pianobar/config`). To spawn pianobar so it actually picks up the
config this daemon manages, the daemon derives `XDG_CONFIG_HOME` from
`PIANOBAR_CONFIG_PATH` by stripping the trailing `pianobar/config`. If you
override this path, keep that suffix.

## Running locally

```sh
npm install
cp path/to/mqtt-password ./mqtt-password   # or point MQTT_PASSWORD_FILE elsewhere
MQTT_USERNAME=your-scoped-user MQTT_PASSWORD_FILE=./mqtt-password npm run dev
```

`npm run dev` runs the TypeScript source directly (via `tsx`), no build
step needed. For a production-style run:

```sh
npm run build
MQTT_USERNAME=your-scoped-user MQTT_PASSWORD_FILE=./mqtt-password node dist/index.js
```

On startup the daemon will:

1. Write the placeholder `event_command` script if one doesn't already exist.
2. Merge `fifo`/`event_command` into the pianobar config file (creating it,
   and its parent directory, if needed).
3. Look for a live pianobar process via the pidfile; if none is found (or
   the pidfile is stale), spawn a fresh detached pianobar.
4. Connect to MQTT and subscribe to `gomac/pandora/cmd`.

Stopping the daemon (`Ctrl+C` / `SIGTERM`) disconnects MQTT and exits — it
deliberately does **not** kill the detached pianobar process, so restarting
the daemon never interrupts playback.

## Testing it end-to-end without the app or Home Assistant

Per Phase 1 of the spec, this is testable directly with `mosquitto_pub`:

```sh
mosquitto_pub -h 127.0.0.1 -u your-scoped-user -P yourpassword \
  -t gomac/pandora/cmd -m '{"action":"next"}'
```

Supported `action` values: `love`, `ban`, `next`, `pause`, `resume` (alias
`play`), `toggle` (pause/resume toggle), `tired`, `volume_down`,
`volume_up`, `volume_reset`, `restart`.

## Running the tests

```sh
npm test          # single run
npm run test:watch
npm run typecheck
```

Tests mock the MQTT broker, the real `pianobar` binary, and process signals
throughout (see `test/processManager.test.ts` for the injectable
`ProcessOps` used to avoid spawning real processes). The one exception is
`test/fifoWriter.test.ts`, which exercises `writeFifoKey` against a real
named pipe created with `mkfifo` — no MQTT or pianobar involved, just the
OS-level FIFO semantics the daemon depends on.

## Decisions worth flagging for review

- **Action naming for `resume`/`play` and the pause-resume toggle**: the
  spec's Command Surface table lists "resume/play" as one entry and
  "pause/resume toggle" as another. This implementation accepts both
  `resume` and `play` as aliases for the same keystroke (`P`), and uses
  `toggle` as the action name for the `p` keybinding. Not specified
  verbatim in the spec — a naming call made here.
- **Managed pianobar config file merges rather than replaces.** Rather than
  writing a fresh config, the daemon reads the existing file (if any) and
  rewrites only the `fifo` and `event_command` lines, leaving everything
  else — most importantly Pandora credentials — untouched. This was the
  only way to satisfy "generate/manage the pianobar config file" without
  ever handling credentials in this daemon's code.
- **Availability/LWT topic (`gomac/pandora/availability`) is included in
  Phase 1**, even though the Phase 1 description in
  `notes/pandora-mqtt-spec.md` only explicitly calls out
  command-handling and doesn't mention it. `notes/dev/bridge-daemon-spec.md`
  states "every daemon gets one from the start" as a blanket rule (not
  phased), and it's a cheap, low-risk addition distinct from the "no
  telemetry" exclusion (telemetry there means now-playing/rating/etc. state,
  which this daemon genuinely does not publish). Flagging this explicitly
  in case the intent was to defer it to Phase 2 alongside the rest of the
  MQTT state surface.
- **FIFO path defaults to pianobar's existing `~/.config/pianobar/ctl`**,
  not a daemon-private path, specifically so `pianobar-mpris-bridge.py`
  (which already writes to that path) keeps working unmodified — FIFOs
  support multiple concurrent writers, so this is additive, not a conflict.

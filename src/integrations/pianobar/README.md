# GOMAC Pianobar Daemon

A standalone Node/TypeScript daemon that owns pianobar's process lifecycle,
exposes its command surface over MQTT, and publishes now-playing telemetry,
per the shared conventions in `notes/dev/bridge-daemon-spec.md` and the
daemon-specific design in `notes/pandora-mqtt-spec.md` (in this directory).

**This is a Phase 3 implementation.** Phase 1 covered process ownership and
the Tier 1 command surface; Phase 2 added telemetry and `select_source`.
Phase 3 adds:

- Home Assistant MQTT-discovery config messages
  (`homeassistant/<component>/<object_id>/config`) so this daemon's existing
  commands/telemetry show up as real HA entities — `sensor` (now-playing
  title/artist/album/station/rating), `image` (album art), `button` (skip,
  love, ban, tired, play, pause, volume up, volume down, restart), and
  `select` (station picker) — all grouped under one HA device. See "Home
  Assistant integration" below.

It does **not** yet widen Mosquitto's listener, wire up the KMP app, the
quickmix-toggle command (`x`), or the bookmark command (`b`) — see
"Development Phases" in the spec for what comes later.

## What it does

- Spawns `pianobar` as a detached child process (survives the daemon's own
  restarts) and tracks it via a pidfile — verifying, via `/proc/<pid>/comm`,
  that a pidfile's PID is actually still pianobar before adopting it, so a
  stale pidfile pointing at a PID the OS has since reused for something
  else can't be mistaken for a live pianobar.
- Creates pianobar's control FIFO (`mkfifo`) if it doesn't already exist —
  pianobar never creates its own, per `man pianobar`.
- Generates/manages pianobar's own config file, setting only the `fifo` and
  `event_command` keys it needs — every other line (crucially, Pandora
  credentials) is left untouched if the file already exists.
- Writes an `event_command` wrapper script pointing at this daemon's own
  runner (`eventCommandRunner.ts`/`.js`, matching whichever mode — `tsx` or
  built — the daemon itself is running under). Each event fires the runner
  as a fresh process (pianobar's own model, not this daemon), which hands
  the event off to the running daemon over a local Unix domain socket; the
  daemon publishes the resulting state topics on its own already-connected
  MQTT client. See "How telemetry gets from pianobar to MQTT" below for why.
- Connects to a local MQTT broker under its own scoped identity, subscribes
  to `gomac/pandora/cmd`, and for each `{"action": "<name>"}` message either
  writes the corresponding single keystroke to pianobar's control FIFO
  (Tier 1 actions), selects a station (`select_source`), sets the system
  output volume (`volume_set`), or performs a managed restart (`restart`).
- Controls **system/PipeWire output volume** via `wpctl`, not pianobar's own
  internal gain (`volume_up`/`volume_down`/`volume_reset`, which only nudge
  relatively and have no absolute "set to X" concept — see `systemVolume.ts`).
  Publishes the actual resulting level to `gomac/pandora/state/volume` on
  every change and once at startup, following the same "report reality, not
  intent" approach already proven by the ad hoc TheFlea `media_player`
  integration this replaces.
- Publishes Home Assistant MQTT-discovery config so all of the above shows
  up as real, controllable HA entities under one device — see "Home
  Assistant integration" below.

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
| `PIANOBAR_EVENT_SOCKET_PATH` | `~/.local/state/gomac-pianobar/eventcmd.sock` | Unix domain socket the daemon listens on for telemetry handoffs from each `event_command` invocation. Owned entirely by this daemon. |
| `PIANOBAR_PIDFILE_PATH` | `~/.local/state/gomac-pianobar/pianobar.pid` | |
| `PIANOBAR_AUTOSTART_STATION_ID` | `970427846688346580` (Tool Radio) | Real, verified-working station ID, not a placeholder guess — see "Why `autostart_station` is managed" below. The default is arbitrary and expected to be overridden once a real preference is picked. |
| `RESTART_SIGTERM_TIMEOUT_MS` | `5000` | How long `restart` waits after `SIGTERM` before escalating to `SIGKILL`. |
| `GOMAC_PIANOBAR_CONFIG_FILE` | *(none)* | Optional path to a JSON file providing any of the above as defaults (env vars still take precedence). Shape: `{"mqtt": {...}, "pianobar": {...}, "pidFilePath": "...", "restartSigtermTimeoutMs": ...}` — see `src/config.ts` for the exact keys. |

### Why `PIANOBAR_CONFIG_PATH` has that shape

pianobar has no flag to point it at an arbitrary config file — it only ever
reads `$XDG_CONFIG_HOME/pianobar/config` (falling back to
`~/.config/pianobar/config`). To spawn pianobar so it actually picks up the
config this daemon manages, the daemon derives `XDG_CONFIG_HOME` from
`PIANOBAR_CONFIG_PATH` by stripping the trailing `pianobar/config`. If you
override this path, keep that suffix.

### Why `autostart_station` is managed

**Found live during this daemon's own acceptance testing against a real
pianobar login, not assumed up front**: without `autostart_station` set,
pianobar doesn't play anything after logging in at all — it drops straight
into an interactive numbered station-selection prompt and waits there.
That silently defeats the entire point of the `restart` command (Process
Ownership, above): restarting to recover from a lockup would leave music
*stopped*, not resumed, since pianobar would just be sitting at that prompt
again with nothing driving it forward.

It also broke `select_source` in a specific, confirmed way: at that prompt,
pianobar expects a **bare** station number (no leading `s` — it's already
showing the list), while `select_source`'s normal implementation always
sends `s<index>` because that's correct once pianobar is in its regular
playback loop, where `s` is what enters selection mode in the first place.
Verified directly: sending a bare number to a pianobar sitting at this
prompt selected and played the right station; the daemon's actual `s<N>`
sequence did nothing, silently.

pianobar has no "resume last station" mode to fall back on instead — see
`pianobarConfig.ts`'s doc comment for why (no station ID is ever exposed
via `event_command`, only display names, and the only place an ID appears
is pianobar's own interactive stdout, which this daemon deliberately
doesn't capture). So a fixed default is configured instead: real, verified
live (selecting it by index actually started playback correctly during
testing), not an arbitrary guess — but still just a placeholder pending an
actual preference, easily changed via `PIANOBAR_AUTOSTART_STATION_ID`.

With `autostart_station` set, pianobar goes straight into its normal
playback loop on login/restart, so this whole prompt state — and the
`select_source` failure mode above — shouldn't come up in practice anymore.
The one caveat: for the narrow window between a `restart` command being
issued and the autostart station's first song actually starting, pianobar
could theoretically still be in a transitional state where a same-instant
`select_source` might not land correctly. Not fixed here — the daemon has
no way to observe pianobar's internal UI state over the one-way FIFO, and
this window is narrow enough in practice not to warrant the complexity of
solving it now.

## How telemetry gets from pianobar to MQTT

pianobar's `event_command` mechanism forks a **brand-new process per
event** (`man pianobar`, `EVENTCMD` section) — it is never the long-running
daemon process. That process gets the event name as `argv[1]` and
`key=value` data on stdin, and pianobar `waitpid`s on it before continuing
its own event loop (confirmed directly in pianobar 2024.12.21's own
`BarUiStartEventCmd`; for `songstart` specifically, that wait happens
*before* the player thread starts, so a slow `event_command` directly
delays audio starting).

Given that, this daemon does **not** open a second MQTT connection per
event. Instead:

1. `eventCommand.ts` generates a tiny wrapper script (pianobar's actual
   `event_command`) that re-execs this package's `eventCommandRunner`
   (`.ts` via `npx tsx` in dev, `.js` via plain `node` once built —
   whichever mode `index.ts` itself detects it's running under).
2. `eventCommandRunner.ts` parses argv/stdin and hands the event off to the
   already-running daemon over a Unix domain socket (`PIANOBAR_EVENT_SOCKET_PATH`)
   via `telemetryClient.ts`'s `sendTelemetryEvent`, then exits. This is a
   local socket round-trip, not an MQTT handshake, specifically to stay
   fast on the pianobar-blocking path above; it also has a hard 3s timeout
   and never throws, so a missing/restarting daemon just means that one
   event's telemetry is silently dropped rather than pianobar hanging.
3. `telemetryServer.ts`, running inside the daemon process, receives the
   handoff and publishes the resulting `gomac/pandora/state/<metric>`
   topics on the daemon's **own existing MQTT connection** — the same
   connection Tier 1/2 commands are handled on, authenticated as this
   daemon's one configured identity, never a second one.

This also happens to solve the "how does the command handler get the
station list `select_source` needs" question for free: `telemetryServer.ts`
updates an in-memory `StationDirectory` from every event's station-list
field (not just `usergetstations` — see below), and `commandHandler.ts`
reads from that same object when handling `select_source`.

### Investigated: does pianobar's `s` numbering match `usergetstations`'s list order?

**Yes — verified directly against pianobar 2024.12.21's own source** (the
exact version installed on TheFlea; fetched from
`github.com/PromyLOPh/pianobar` at that tag), not assumed. Both:

- the interactive `s` prompt (`BarUiSelectStation` in `src/ui.c`), and
- every `event_command` invocation that carries a station list
  (`BarUiStartEventCmd`, also in `src/ui.c` — which fires for all seven
  events this daemon handles, not only `usergetstations`)

call the exact same function, `BarSortedStations(stations, &stationCount,
settings->sortOrder)`, with the exact same `sortOrder` (default
`BAR_SORT_NAME_AZ`, alphabetical by name; user-configurable via pianobar's
own `sort` config key, but still the same value both call sites read from
the same running `settings`). The index pianobar prints next to a station
in the `s` prompt is therefore guaranteed to be the same index that
station occupies in `stationN` fields on every telemetry event — as long as
the station set itself hasn't changed (added/removed/renamed via another
client) between the most recent telemetry event and the `select_source`
command being sent. This daemon narrows that staleness window as far as
the architecture allows by refreshing its cached station list from *every*
telemetry event's station-list field, not only `usergetstations` (see
`telemetry.ts`'s `EVENT_METRICS` table) — pianobar attaches a freshly
re-sorted list to every one of them regardless.

See `src/telemetry.ts`'s doc comment on `parseStationList` and
`src/commandHandler.ts`'s doc comment on `findStationIndex` for the same
finding in code, next to where it matters.

### Investigated: what form is `coverArt` in?

**A URL — verified, not assumed.** pianobar's `src/libpiano/response.c`
sets it directly from Pandora's own API response: `song->coverArt =
PianoJsonStrdup(s, "albumArtUrl")`. It is passed through unmodified to the
`gomac/pandora/state/cover_art` topic.

(Also verified while in the source: `rating` is printed as pianobar's raw
`PianoSongRating_t` integer — 0 none, 1 love, 2 ban, 3 tired — not a word;
this daemon maps it to `none`/`love`/`ban`/`tired` before publishing.

### Known caveat: `song_duration_ms` at `songstart` looked wrong in live testing

Confirmed against a real pianobar login, not just unit tests: `songstart`'s
`song_duration_ms` was observed as `275` for a multi-minute track — clearly
not the real length. Not investigated further or fixed here, since it
doesn't affect any command functionality, but flagging it rather than
letting it look like a solid, verified value: `songDuration` is read from
`player->songDuration` at the moment the event fires, and pianobar may not
have that populated accurately yet this early in playback. Worth checking
whether it's reliable by `songfinish` before depending on it for anything.
`songDuration`/`songPlayed` are milliseconds, confirmed by pianobar's own
`contrib/eventcmd-examples/eventcmd.sh` dividing `songDuration` by 1000
before handing it to a scrobbler expecting seconds — published here as
`song_duration_ms`/`song_played_ms` rather than a bare, unit-ambiguous
name.)

## Home Assistant integration

On every MQTT connect (and reconnect), the daemon publishes retained
discovery config messages to `homeassistant/<component>/gomac_pandora_<id>/config`
for every entity below, per `notes/dev/bridge-daemon-spec.md`'s discovery
topic convention. All of them share one `device` block (`identifiers:
["gomac-pandora"]`, name "Pandora"), so they group under a single device in
HA's UI, and one `availability_topic` (`gomac/pandora/availability`), so
they correctly show unavailable when this daemon is down.

- **`sensor`** — `title`, `artist`, `album`, `station`, `rating`, each
  reading its existing `gomac/pandora/state/<metric>` topic directly.
- **`image`** — album art, wired via `url_topic` to
  `gomac/pandora/state/cover_art`.
- **`button`** — one per Tier 1/process action: skip (`next`), love, ban,
  tired, play, pause, volume up, volume down, and restart (marked with HA's
  standard `restart` `device_class`). Each publishes the same
  `{"action": "..."}` payload `gomac/pandora/cmd` already expects.
- **`select`** — station picker. Its `options` list is populated from the
  most recently known station list (`gomac/pandora/state/stations`) and its
  `command_template` renders a selection as
  `{"action": "select_source", "station": "<chosen name>"}`, matching
  `commandHandler.ts`'s existing `select_source` handler exactly.

### Investigated: does the `image` entity need a URL topic or a raw-bytes topic?

**A URL topic (`url_topic`), not a raw-bytes topic (`image_topic`) —
verified against HA's own MQTT `image` integration docs, not assumed.**
`coverArt` is confirmed (see "Investigated: what form is `coverArt` in?"
above) to always be a URL string straight from Pandora's API, never raw
image bytes — `url_topic` is HA's mechanism for exactly that case (HA
itself downloads the image from the URL it receives); `image_topic` expects
the daemon to publish actual image bytes on the topic, which it never has
and would have no reason to start doing.

### Investigated: how does HA's MQTT `select` handle an options list that changes at runtime?

**A discovery config's `options` field is static at the moment it's
published — there's no separate "patch the options" message type.**
Verified against HA's own MQTT discovery docs, not assumed: "Subsequent
messages on a topic where a valid payload has been received will be
handled as a configuration update" — republishing the *same* discovery
config topic (same `unique_id`) with a new payload is the documented way
to update an already-discovered entity in place, not something that
creates a duplicate or requires deleting/recreating the entity first.

So that's what this daemon does: `StationDirectory` (already tracking the
most recently known station list for `select_source`, see Phase 2 above)
now also supports `onStationsChanged`, which fires only when the list
genuinely differs from what was previously known — pianobar attaches a
station list to nearly every telemetry event, not just `usergetstations`,
so without that dedupe this would republish on almost every song.
`mqttClient.ts` wires that listener to republish just the select's
discovery config (`haDiscovery.ts`'s `buildSelectDiscoveryConfig`) with the
new `options` array, retained, every time it fires — in addition to
publishing it once at startup using whatever station list (possibly none
yet) is already known.

**Known caveat, not fixed here**: `select`'s `options` list and its
`state_topic` (`gomac/pandora/state/station`, the currently-playing
station) come from independent updates. If a station is added or renamed
through some other Pandora client and the currently-playing station
changes to reflect it before this daemon's next telemetry-driven `options`
refresh lands, HA may briefly see a `state_topic` value that isn't in its
current `options` list. Not a new problem introduced here — it's the same
staleness window `select_source`'s FIFO index lookup already has (see
"Investigated: does pianobar's `s` numbering match..." above) — but worth
knowing this surfaces in the `select` entity's UI too, not just in command
handling.

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

1. (Re)write the `event_command` script so it points at this daemon's own
   runner, matching whichever mode (`tsx`/dev or built) is currently running.
2. Merge `fifo`/`event_command` into the pianobar config file (creating it,
   and its parent directory, if needed).
3. Look for a live pianobar process via the pidfile; if none is found (or
   the pidfile is stale), spawn a fresh detached pianobar.
4. Start listening on the telemetry Unix socket (`PIANOBAR_EVENT_SOCKET_PATH`).
5. Connect to MQTT and subscribe to `gomac/pandora/cmd`.

Stopping the daemon (`Ctrl+C` / `SIGTERM`) disconnects MQTT and exits — it
deliberately does **not** kill the detached pianobar process, so restarting
the daemon never interrupts playback.

## Testing it end-to-end without the app or Home Assistant

Commands are testable directly with `mosquitto_pub`:

```sh
mosquitto_pub -h 127.0.0.1 -u your-scoped-user -P yourpassword \
  -t gomac/pandora/cmd -m '{"action":"next"}'
```

Supported `action` values: `love`, `ban`, `next`, `pause`, `resume` (alias
`play`), `toggle` (pause/resume toggle), `tired`, `volume_down`,
`volume_up`, `volume_reset`, `restart`, `select_source`, `volume_set`.

`volume_set` takes a `volume` field — a number from `0.0` to `1.0` (values
outside that range are clamped), setting the **system** output level via
`wpctl`, not pianobar's own `volume_down`/`volume_up`/`volume_reset`
keystrokes above (a different, relative-only mechanism — see "What it
does").

`select_source` takes a `station` field — the station's name, matched
case-insensitively against the most recently published station list (see
`gomac/pandora/state/stations` below). It's a no-op (logged, not thrown) if
no station list has been received yet, or if the name doesn't match one:

```sh
mosquitto_pub -h 127.0.0.1 -u your-scoped-user -P yourpassword \
  -t gomac/pandora/cmd -m '{"action":"select_source","station":"Chill Mix"}'
```

Telemetry is testable by watching the retained state topics while pianobar
plays (or by invoking a `songfinish`/`usergetstations`/etc. event by hand
through the daemon's actual `event_command` script, to exercise the same
path pianobar uses):

```sh
mosquitto_sub -h 127.0.0.1 -u your-scoped-user -P yourpassword -v -t 'gomac/pandora/state/#'
```

Published metrics: `title`, `artist`, `album`, `station`, `rating`
(`none`/`love`/`ban`/`tired`), `cover_art` (a URL — see "Investigated:
what form is `coverArt` in?" above), `song_duration_ms`, `song_played_ms`,
and `stations` (a JSON array of station names, in the same order
`select_source` above matches against).

## Running the tests

```sh
npm test          # single run
npm run test:watch
npm run typecheck
```

Tests mock the MQTT broker, the real `pianobar` binary, and process signals
throughout (see `test/processManager.test.ts` for the injectable
`ProcessOps` used to avoid spawning real processes). The exceptions, which
exercise real OS-level primitives with no MQTT or pianobar involved:

- `test/fifoWriter.test.ts` — a real named pipe created with `mkfifo`.
- `test/telemetryClient.test.ts` / `test/telemetryServer.test.ts` — a real
  Unix domain socket in a temp directory, with a fake MQTT client object
  standing in for the broker on the server side.

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
- **Added during review, not in the original implementation**: FIFO
  creation and the PID-reuse guard described above. Neither was in the
  original spec brief explicitly; both are needed for "process ownership"
  to actually hold on a genuinely fresh deployment / after a long-uptime
  restart. The PID-reuse guard compares against `/proc/<pid>/comm`, which
  the kernel truncates to 15 characters — verified live during this
  daemon's own acceptance testing (a 16-character stand-in binary name
  came back truncated, and an early version of this check compared against
  the untruncated name, wrongly failing to recognize a live, correctly
  running process). The comparison now truncates its expected side to
  match; see the regression test in `test/processManager.test.ts`.

### Phase 2 additions

- **Unix-socket handoff instead of a per-event MQTT connection.** The task
  left the transport mechanism open; a per-invocation MQTT connection was
  considered and rejected once source-reading showed pianobar synchronously
  blocks on each `event_command` process exiting (see "How telemetry gets
  from pianobar to MQTT" above) — a socket round-trip is cheaper than an
  MQTT handshake on that path, and it also means telemetry always goes out
  on this daemon's one actual existing connection rather than a second
  connection merely sharing its credentials. Trade-off: if the daemon isn't
  currently running/listening when an event fires (e.g. mid-restart), that
  event's telemetry is silently dropped rather than buffered or retried —
  bounded by a 3s timeout so pianobar itself is never blocked waiting on
  it. This is a real limitation worth knowing about, not a corner quietly
  cut: a per-event MQTT connection would have the identical drop-on-outage
  characteristic (if the broker's down, the connection just fails), so this
  isn't a gap specific to the socket approach.
- **`event_command`'s wrapper script is now always regenerated**, rather
  than left alone if a file already exists (Phase 1's placeholder
  preserved custom content). This script is entirely daemon-owned — same
  as the managed `fifo`/`event_command` lines in pianobar's own config —
  so there's nothing of a user's to preserve, and always regenerating keeps
  it correct if the daemon starts running from a different mode (`tsx` vs.
  built) than it did last time.
- **`select_source`'s payload uses a `station` field carrying a name**,
  matched case-insensitively against the most recently known station list,
  rather than a numeric index. An index would have been usable directly,
  but would leak an internal, alphabetically-sorted implementation detail
  into the app/HA-facing contract for no real benefit — `gomac/pandora/state/stations`
  already publishes the full name list for any client to search MQTT-side
  or offer in a UI.
- **Every telemetry event refreshes the cached station list**, not only
  `usergetstations` — see `telemetry.ts`'s `EVENT_METRICS` table. This
  isn't scope creep: pianobar attaches a freshly re-sorted station list to
  every `event_command` invocation regardless (confirmed in source, see
  the investigation above), so this is free data that directly narrows
  `select_source`'s staleness window.
- **State topics only publish when pianobar actually sent a non-blank
  value for that field.** `usergetstations` fires with no current
  song/station (pianobar passes `curStation = NULL`), which would otherwise
  blast the retained `title`/`artist`/`station`/etc. topics with empty
  strings on every station-list refresh. `buildStateMessages` in
  `telemetry.ts` restricts each event to a specific metric allow-list (per
  the spec's own Telemetry Surface table) and additionally skips any field
  that's absent or blank, so an unrelated event can't clobber "now playing"
  state that's still genuinely current.
- **`rating` is published as a word (`none`/`love`/`ban`/`tired`), not
  pianobar's raw integer.** Matches the human-readable-plain-value spirit
  of `bridge-daemon-spec.md`'s state-topic convention, and directly
  reflects the Pandora-specific three-rating-state model
  `bridge-daemon-spec.md`'s Media Player contract section already
  describes (`tired` as a third state beyond generic `rate`).

### Phase 3 additions

- **Discovery configs are republished on every MQTT connect/reconnect**,
  not published once and left alone — same reasoning as the existing
  `online` availability publish in `mqttClient.ts`'s `connect` handler:
  cheap, idempotent (retained messages with identical content are a no-op
  on the broker), and self-healing if the broker ever loses its retained
  message store.
- **The station `select` entity's `options` list is kept live via
  `StationDirectory.onStationsChanged`**, not left static after the first
  discovery publish — see "Investigated: how does HA's MQTT `select` handle
  an options list that changes at runtime?" above for the full finding and
  why a bare "publish once at startup" implementation would have quietly
  gone stale the first time a station was added or removed elsewhere.
- **`object_id`/`unique_id` values are explicitly prefixed
  (`gomac_pandora_<name>`)** rather than left to whatever HA would derive
  from `name`/`device` — keeps generated `entity_id`s predictable
  (`sensor.pandora_title`, etc.) and avoids any chance of collision with a
  future adapter's entities under the same HA component namespaces
  (`sensor`, `button`, ...).
- **The restart button gets HA's standard `restart` `device_class`**; no
  other button has a matching standard device class (HA's button
  `device_class` values are limited to `restart`, `identify`, and
  `update`), so the rest are left as plain buttons rather than forcing an
  ill-fitting class onto them.
- **`mqttClient.ts` itself still has no dedicated unit test** (true since
  Phase 1/2) — mocking the `mqtt` package's `connect()` realistically
  wasn't worth it for what's essentially wiring. All of this phase's actual
  logic (which discovery configs get built, when the `select`'s options
  change, how publishing is retried/erred) lives in `haDiscovery.ts` and
  `stationDirectory.ts`, both fully unit tested with a fake MQTT publish
  function, matching the existing `telemetryServer.ts`/`TelemetryMqttClient`
  pattern.

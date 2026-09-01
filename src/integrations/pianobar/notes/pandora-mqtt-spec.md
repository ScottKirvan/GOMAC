# Pandora / pianobar MQTT Daemon — Design Spec

The first standalone daemon built to `notes/dev/bridge-daemon-spec.md`'s shared
conventions, and the first implementation of that doc's generic "Media
Player" contract. Runs as its own process (`src/integrations/pianobar/` — see
`notes/dev/bridge-daemon-spec.md`'s Process Model and Repo Layout sections; the
original mono-daemon/multi-adapter design was reconsidered per GitHub
issue #22 before any of this was built). This doc covers pianobar
specifically: what's already running, the full command/telemetry surface
pianobar exposes, and which parts of that surface a
FIFO-and-`event_command`-based bridge can actually drive reliably today
versus what needs more infrastructure later.

**This daemon is fully functional with zero Home Assistant involvement**
— see `notes/dev/bridge-daemon-spec.md`'s HA section. HA entities described below
are a free-riding presentation layer on top of messages the daemon sends
regardless.

## Current State (verify against `compute-hub-current-state.md`, not just here)

- pianobar is installed and running on TheFlea (`/usr/bin/pianobar`,
  version 2024.12.21), authenticated, playing over Bluetooth to a JBL GO 2
  speaker. **Currently run manually inside a tmux session** (`work`,
  window 1, pane 1) — this is being retired in favor of the daemon owning
  the process outright, see Process Ownership below. Scott has agreed to
  give up direct tmux access to pianobar in exchange for app-based
  restart control.
- Config (`~/.config/pianobar/config`, credentials excluded here):
  `fifo = /home/scott/.config/pianobar/ctl`, `control_proxy =
  http://127.0.0.1:8118/`. **No `event_command` is currently set** — see
  Process Ownership below for how this gets resolved (the daemon spawns
  pianobar with it configured from the start, rather than a separate
  quit-and-relaunch step).
- **`pianobar-mpris-bridge.py` already exists and must not be broken.** A
  separate, already-working script (`~/.local/bin/pianobar-mpris-bridge.py`,
  running as a user systemd service) that writes single pianobar keybinding
  characters (`P`/`S`/`p`/`n`) into the same FIFO, bridging Bluetooth AVRCP
  buttons via `mpris-proxy`. This predates GOMAC and is orthogonal to it.
  FIFOs support multiple writers, and single-character writes are
  trivially atomic, so the new adapter writing to the same FIFO is
  additive and safe — not a replacement, not a conflict. Both can write to
  it concurrently with no coordination needed.
- No `event_command` script exists yet, so pianobar currently reports
  nothing about what's playing anywhere outside its own terminal UI.

## Process Ownership

**Decided: the daemon spawns and owns pianobar's process, not systemd, not
a manually-run tmux session.** Motivation: pianobar locks up occasionally
and has needed a manual restart via SSH — the goal is triggering that from
the app instead, with nobody needing to log into TheFlea.

- The daemon spawns pianobar as a **detached** child process (survives the
  daemon's own restarts/redeploys — restarting the bridge shouldn't
  interrupt music) and tracks its PID via a pidfile, since a detached
  child isn't reachable through Node's own child-process handle after a
  daemon restart.
- **Why not systemd**: making pianobar a systemd unit would be a
  TheFlea-side system change requiring a change doc for Scott's IT agent,
  per this repo's domain-separation model (see
  `compute-hub-current-state.md`). Owning the subprocess directly keeps
  this entirely inside GOMAC's own code.
- **Restart mechanism**: `SIGTERM`, escalating to `SIGKILL` after a
  timeout if pianobar doesn't exit — not the FIFO's `q` keybinding. A
  genuinely locked-up pianobar won't reliably respond to FIFO input
  either, confirmed firsthand during this project's own design session
  (an accidentally-duplicated pianobar process didn't respond to `SIGINT`
  promptly and needed a harder kill).
- **New command**: `restart` — not part of the generic Media Player
  contract in `bridge-daemon-spec.md` (process-lifecycle management isn't
  a playback verb, and per that doc's own discipline, nothing gets
  generalized into the shared contract from a single instance). Lives on
  the same `gomac/pandora/cmd` topic as everything else,
  `{"action": "restart"}`.
- **Explicitly manual-trigger only.** Automatic hang detection (the daemon
  noticing pianobar is stuck and restarting it unprompted) is a much
  fuzzier problem — no reliable signal distinguishes "locked up" from
  "quiet between songs" without real false-positive risk. Out of scope
  here; someone (via the app) decides when to restart, the daemon just
  makes that possible without SSH.
- **Transition**: the currently-running manual tmux session gets replaced,
  not run alongside the daemon-owned instance — one pianobar process,
  owned by the daemon, going forward. This means enabling `event_command`
  (the config-file gap noted in Current State above) happens naturally as
  part of the daemon's own spawn step, not as a separate one-time
  quit-and-relaunch — the daemon just launches pianobar correctly
  configured from the start.

## Command Surface

Pianobar's full keybinding set (from `man pianobar`, `REMOTE CONTROL`
section — commands are single characters written to the FIFO, e.g. `echo
-n 'n' > ~/.config/pianobar/ctl` for skip). Tiered here by what's reliably
automatable through a **one-way** FIFO with no visibility into pianobar's
own terminal output, versus what genuinely needs more than that.

### Tier 1 — safe, single keystroke, no follow-up input needed

Fully drivable today, no further infrastructure required.

| Action | Key | Generic contract mapping |
|---|---|---|
| Love song | `+` | `rate` (like) |
| Ban song permanently | `-` | `rate` (dislike) |
| Skip song | `n` | `next` |
| Pause | `S` | `pause` |
| Resume | `P` | `play` |
| Pause/resume toggle | `p` / `<Space>` | — (redundant with `play`/`pause`, no separate generic verb needed) |
| Ban for one month ("tired") | `t` | — (Pandora-specific third rating state beyond generic `rate`, see mapping table below) |
| Decrease volume (pianobar's own gain, not system volume) | `(` | `volume_down` |
| Increase volume | `)` | `volume_up` |
| Reset volume | `^` | — (no generic "reset" verb; not the same as `volume_set` since there's no target level) |

### Tier 2 — single keystroke, but needs a follow-up selection the daemon must already know

Drivable via FIFO, but only if the adapter already has the needed list
data (from a prior telemetry event) to pick the right item blind — there's
no way to read pianobar's response to confirm before sending the next
character.

| Action | Key | Notes |
|---|---|---|
| Select another station | `s` | Needs the station list (from the `usergetstations` event, see Telemetry below) to know which number to send after `s` |
| Toggle quickmix station membership | `x` | Multi-select flow (`t` to toggle, `a`/`n` for all/none) — needs the same station-list awareness |
| Bookmark current song or artist | `b` | Prompts a song-vs-artist follow-up keypress — simple, but unverified against the live box (see Open Questions) |

### Tier 3 — multi-step, free-text search, dynamic result selection

**Not reliably automatable through a one-way FIFO.** These require
pianobar to prompt with a search string, return dynamically-generated
results, and let the user pick from that list — real back-and-forth that
the FIFO (write-only, no readback) and `event_command` (fires on completed
events, not mid-interaction prompts) don't support. Driving these
correctly would need a PTY-based wrapper capturing pianobar's live terminal
output (an `expect`-style approach), which is materially more
infrastructure than this adapter builds today.

| Action | Key |
|---|---|
| Add more music to current station (search) | `a` |
| Create new station (search) | `c` |
| Add genre station | `g` |
| Add shared station by ID | `j` |
| Create station from current song/artist | `v` |
| Delete artist/song seeds or feedback | `=` |
| Change Pandora settings | `!` |
| Delete current station | `d` |
| Rename current station | `r` |

`d` and `r` are listed here rather than Tier 2 because it's not verified
whether they act immediately on the current station or prompt for
confirmation/input first — flagged as an open question below rather than
assumed either way.

### Informational (not real commands — display-only)

`?` (help), `h` (history), `i` (song info), `e` (song explain), `u`
(upcoming songs) just print to pianobar's own terminal. Not meaningful to
wire up as MQTT commands — the structured data this adapter actually needs
(now playing, history) comes from `event_command`'s telemetry events
instead (see below), which is strictly better than scraping display
output.

## Telemetry Surface

pianobar's `event_command` mechanism (`man pianobar`, `EVENTCMD` section):
an external script is invoked with the event name as `argv[1]`, and
structured song/station data supplied via **stdin** as `key=value` lines.

**Fields confirmed available** (from pianobar's own
`contrib/eventcmd-examples/eventcmd.sh`): `title`, `artist`, `album`,
`stationName`, `songStationName`, `pRet`, `pRetStr`, `wRet`, `wRetStr`,
`songDuration`, `songPlayed`, `rating`, `coverArt`, `stationCount`,
`station[0-9]*`.

**`coverArt` is the source for HA's `image` entity / album art support.**
Its exact form (a URL vs. raw data) is not yet verified against a live
event firing — needs confirming when this is actually implemented, not
assumed.

**Full list of supported events** (`man pianobar`): `artistbookmark`,
`settingschange`, `settingsget`, `songban`, `songbookmark`, `songexplain`,
`songfinish`, `songlove`, `songshelf`, `songstart`, `stationaddgenre`,
`stationaddmusic`, `stationaddshared`, `stationcreate`, `stationdelete`,
`stationdeleteartistseed`, `stationdeletefeedback`,
`stationdeletesongseed`, `stationdeletestationseed`, `stationfetchgenre`,
`stationfetchinfo`, `stationfetchplaylist`, `stationgetmodes`,
`stationquickmixtoggle`, `stationrename`, `stationsetmode`,
`usergetstations`, `userlogin`.

Events most relevant to this adapter's state topics:

| Event | Drives |
|---|---|
| `songstart` | Now-playing state: title, artist, album, rating, cover art |
| `songfinish` | Play-completion telemetry (`songPlayed` vs. `songDuration`) |
| `songlove` / `songban` / `songshelf` | Rating-state confirmation |
| `usergetstations` | Full station list — also what Tier 2's `s`/`x` commands need to operate blind |
| `stationfetchplaylist` | Confirms a station change succeeded |

## Media Player Entity

A real Home Assistant custom integration (Python, config-entry based — see
"Lessons From the Ad Hoc TheFlea Integration" below for why config-entry is
required), with an entity class inheriting `MediaPlayerEntity`
(`homeassistant.components.media_player`), plus a custom Lovelace card —
both built, living in `src/integrations/pianobar/homeassistant/`:
`custom_components/gomac_pandora/` (the integration) and
`www/gomac-pandora-card/` (the card).

**No daemon changes** — reads the same `gomac/pandora/state/*` topics,
writes the same `gomac/pandora/cmd` topic this daemon already
publishes/subscribes. Both the integration and the card are just MQTT/HA-
service clients, same as the app will eventually be.

**Maps onto `MediaPlayerEntity`'s standard properties**: title, artist,
album, volume (`volume_level`, `VOLUME_SET`), station (as `source`/
`source_list`/`SELECT_SOURCE`), album art (`entity_picture`). `previous`
has no pianobar support (documented above) and isn't exposed.

**Why a custom Lovelace card, not the stock media_player card**: HA's
`MediaPlayerEntityFeature` enum has no love/ban/tired equivalent — a
fixed, HA-core-owned set the stock card renders buttons from, not
something a custom integration can extend. The card renders the
media_player entity's info/controls plus love/ban/tired/restart buttons in
one unified box; those buttons call the standard `button.press` service
against the `button` entities `haDiscovery.ts` still publishes for exactly
this (`love`, `ban`, `tired`, `restart` only — no new custom services
needed; they're not meant to be placed on a dashboard directly once the
card exists). The card also matches HA's own media_player more-info
dialog's live-drag volume behavior (debounced native `input` event),
unlike the generic `number` entity's release-only behavior — tied to
entity domain/base class, not anything MQTT config can influence.

**Retired from `haDiscovery.ts`**: `sensor` (title/artist/album/station/
rating), `image` (cover art), `select` (station), `number` (volume), and
the `skip`/`play`/`pause`/`volume_up`/`volume_down` buttons — all
superseded by the media_player entity + custom card. Not yet removed from
the code as of this writing — held pending cross-testing against the new
card.

**Retirement, not part of this repo's work**: the ad hoc TheFlea
integration (`custom_components/mediaplayer_mqtt/`,
`mediaplayer-mqtt-bridge.py`, its systemd service) gets retired once this
is live and verified — TheFlea-side cleanup, a request to hand off, not a
GOMAC-repo change.

Tier 3 actions are **not** exposed anywhere in this version — they aren't
reliably drivable yet (see above), so there's nothing to wire up.

## Lessons From the Ad Hoc TheFlea Integration

A separate, TheFlea-owned session (not this repo, see
`compute-hub-current-state.md`'s "Domain separation" section) built a
working custom HA `media_player` integration for pianobar before this spec
existed — `media_player.audio_feed_media_player`,
`/opt/homeassistant/config/custom_components/mediaplayer_mqtt/` on
TheFlea. Read directly (2026-08-30) to pull out what it already hit, since
it's real, dated evidence rather than speculation:

- **Config-entry integration is required, not optional, for a real HA
  device.** Confirmed directly in its code comments (dated 2026-08-29): a
  legacy YAML-platform entity cannot attach to a Device — and therefore
  can't be assigned to a Room in HA's UI — even with `device_info` set.
  Only a config-entry-based integration (one with a `config_flow.py`) can.
  Their `config_flow.py` takes no real user input at all; it exists purely
  to force a config entry into being, using a singleton pattern
  (`async_set_unique_id` + `_abort_if_unique_id_configured`) so only one
  instance can ever be added. If this project ever builds a custom HA
  `media_player` integration (see Open Questions below and GitHub issue
  #24), this is the exact mechanism to copy — not the simpler legacy
  platform form, which looks like it should work and silently doesn't.
- **Confirmed independently, from HA's own source**: their code comment
  cites `mqtt/const.py`'s `SUPPORTED_COMPONENTS`, which omits
  `media_player` entirely — the same conclusion this spec already reached
  by reading HA's public docs (see `notes/dev/bridge-daemon-spec.md`), now
  corroborated against the actual installed HA version's source rather
  than just its documentation.
- **A live instance of the exact risk GitHub issue #22 raised.** Their
  bridge script (`mediaplayer-mqtt-bridge.py`) mixes `paho-mqtt` (which
  runs its callbacks on its own network thread) with `dbus-python` (not
  thread-safe to call from there) — every command and connect handler
  explicitly marshals the actual D-Bus work onto the GLib main loop via
  `GLib.idle_add()` rather than calling it directly, with a code comment
  flagging exactly why. Different stack from this project's planned
  Node/TypeScript daemon (threads vs. a single event loop), but the same
  underlying lesson issue #22 raised in the abstract: a naive
  synchronous-looking call into a non-thread-safe/non-reentrant resource
  from the wrong callback context is a real, concrete failure mode, not a
  hypothetical one.
- **Their bridge controls pianobar through its existing MPRIS2 interface**
  (see `pianobar-mpris-bridge.py` in `compute-hub-current-state.md`), not
  pianobar's own FIFO — `MPRIS_BUS_NAME =
  "org.mpris.MediaPlayer2.pianobar"`. This caps their bridge at whatever
  MPRIS2's standard surface offers: play/pause/next/volume only. It has no
  path to any Pandora-specific verb (love/ban/tired/station-select) —
  MPRIS doesn't expose them. This is a live, concrete illustration of why
  this spec's design goes directly to pianobar's FIFO/`event_command`
  instead of through MPRIS: MPRIS is real and already working for the
  generic transport controls, but it's a ceiling, not a path to the fuller
  surface this spec wants.
- **Volume is device volume here, not pianobar's own gain** — their
  bridge reads/sets volume via `wpctl`/PipeWire's default sink, not
  pianobar's internal ReplayGain correction (`(`/`)`/`^`). Concrete,
  already-live confirmation that the "volume means whatever the backend
  exposes" ambiguity flagged in `notes/dev/bridge-daemon-spec.md` is a real fork
  point other implementations have already had to choose on, not a
  hypothetical edge case.
- **State/command topic shape differs from this spec's convention**:
  theirs uses one combined JSON state topic (`mediaplayer/state`, `{state,
  volume}`) and individual plain-payload command topics
  (`mediaplayer/play`, `mediaplayer/pause`, etc.), rather than this spec's
  per-metric state topics and single JSON-payload command topic. Noted as
  a different pattern that happens to work for them, not a reason to
  change this spec's convention — their bridge only needs two state
  fields total, where this spec's fuller telemetry surface (title, artist,
  album, station, rating, cover art) benefits more from per-metric topics
  the way `victron-ble-monitor.py` already does it.

## Generic Media-Player Contract Mapping

Per `notes/dev/bridge-daemon-spec.md`'s "Media Player" adapter type:

| Generic command | pianobar mechanism |
|---|---|
| `play` | `P` via FIFO |
| `pause` | `S` via FIFO |
| `next` | `n` via FIFO |
| `previous` | **Not supported by pianobar at all** — no "previous track" keybinding exists. A real limitation of the backend, not a gap in this adapter. Worth knowing if this contract is ever compared against a backend that does support it. |
| `select_source` | `s` + station number via FIFO (Tier 2) |
| `volume_up` / `volume_down` / `volume_set` | `)` / `(` / — via FIFO. No `volume_set` equivalent — pianobar only exposes relative nudges (`)`/`(`) and a reset (`^`), not an absolute level; `volume_set` is unsupported for this adapter. Also note (per `notes/dev/bridge-daemon-spec.md`): this is pianobar's own internal gain correction, not device/system volume. |
| `rate` (like/dislike) | `+` (love) / `-` (ban) via FIFO. pianobar's `tired` (`t`, ban-for-one-month) is a third state beyond this generic two-state verb — kept as a Pandora-specific extension, not folded into `rate` |
| `seek` | **Not supported** — no scrubbing within a pianobar/Pandora stream |
| `set_playback_speed` | **Not supported** — not a concept pianobar has |

## Android / KMP App Implications

The app talks to the same `gomac/pandora/cmd` / `gomac/pandora/state/*`
topics HA's entities use — nothing app-specific about the MQTT surface.
The app can expose Tier 1 and Tier 2 actions immediately. Tier 3 actions
(station creation/search, genre stations, settings) are **not available to
the app either** until the PTY-capture work (if ever pursued) exists —
this is a limitation of what the daemon can drive, not something the app's
UI layer can work around.

## Development Phases

Sequenced around the real dependencies already documented above, not an
arbitrary split. Each phase is independently testable before moving to the
next.

**Phase 1 — Process ownership + command-only daemon, local testing.**
Stand up `src/integrations/pianobar/` as its own process: takes over
pianobar's lifecycle (spawns it detached, configured with `event_command`
from the start, tracks its pidfile — see Process Ownership above; this is
the one point where the current manually-run tmux instance gets replaced),
connects to Mosquitto under its own MQTT identity, subscribes to
`gomac/pandora/cmd`, writes Tier 1 keystrokes to pianobar's FIFO, and
handles `restart`. No telemetry yet, no HA entities yet. Testable directly
via `mosquitto_pub`/`mosquitto_sub` on TheFlea itself — doesn't need
Mosquitto's listener widened yet, since nothing off-box is involved.
Requires: a scoped MQTT identity + ACL for this daemon (per
`bridge-daemon-spec.md`'s identity model).

**Phase 2 — Telemetry via `event_command`.** Since Phase 1 already spawns
pianobar with `event_command` configured, there's no separate
quit-and-relaunch step here — this phase is just writing the script that
consumes it. Daemon gains an `event_command` script publishing state
topics (now playing, station, rating, cover art) and the availability/LWT
topic. `usergetstations` firing makes Tier 2's `select_source` drivable
for the first time, since the daemon now has the station list it needs to
operate blind.

**Phase 3 — Home Assistant integration.** A config-entry-based custom
`media_player` integration (`custom_components/gomac_pandora/`) plus a
custom Lovelace card — see "Media Player Entity" above for what each piece
covers and what's retired. No dependency on Phase 2 beyond needing its
state topics to exist to point at.

**Phase 3b — Custom Lovelace card.** Frontend-only (no daemon or
Python-integration changes): a single custom card rendering the
media_player entity's info/controls plus love/ban/tired/restart buttons
(via `button.press` against the retained button entities) in one unified
card — including a live-updating-while-dragging volume slider, matching
HA's own `media_player` more-info dialog's approach (debounced `input`
event, not release-only), since this card owns its own frontend code and
isn't limited by HA's generic `number`-entity card.

**Phase 4 — Network exposure + app integration.** Widen Mosquitto's
listener to LAN + Tailscale (`bridge-daemon-spec.md`'s Network Exposure
section) — **only after** the ACL work from Phase 1 actually covers a
per-app identity, per issue #23's ordering fix; never widen first. Issue
the KMP app its own scoped credential, wire its UI to the same
`gomac/pandora/*` topics HA and Phase 1's manual testing already used.

**Phase 5 — Tier 3 exploration (stretch, not committed).** Investigate
whether a PTY-based wrapper capturing pianobar's live terminal output is
worth building to unlock search-based commands (station creation, add
music, genre stations). Only worth doing if the earlier phases are live
and this gap is actually felt in practice, not speculatively up front.

## Open Questions

- [ ] Whether `stationdelete` (`d`) and `stationrename` (`r`) act
  immediately or need confirmation/text input — unverified, needs testing
  against the live pianobar instance
- [ ] Exact form of the `coverArt` event field (URL vs. raw image data) —
  unverified, needs a live event capture to confirm
- [ ] Whether Tier 3 (search-based) commands are worth the PTY-wrapper
  investment at some point, or are permanently out of scope for a
  FIFO-based bridge
- [ ] Whether `bookmark`'s song-vs-artist follow-up prompt is a single
  keypress (as assumed, placing it in Tier 2) or something more — unverified

## References & Prior Art

Searched before designing this, per the same practice `gomac-hub-spec.md`
applied to BojuBot/AItomation. Findings, and why this design deliberately
diverges from them:

- [Doug-Wyman/MQTT_Pianobar](https://github.com/Doug-Wyman/MQTT_Pianobar) —
  a real, working pianobar-to-MQTT-to-HA bridge, but built by polling/
  watching pianobar's config folder for file changes and separately
  scraping pianobar's raw terminal stdout for keyword patterns, rather than
  using pianobar's documented `event_command` mechanism. Its own README
  flags known bugs (MQTT can silently stop on a pipe failure while pianobar
  keeps running; the wrapper shell can exit without killing pianobar,
  leaving duplicate instances behind — the same failure mode that occurred
  by accident during this design session). This adapter uses the
  documented `event_command` hook specifically to avoid that class of
  fragility.
- [kylejohnson/Patiobar](https://github.com/kylejohnson/Patiobar) — a
  Node.js + Socket.IO web frontend directly controlling pianobar's FIFO.
  No MQTT, no Home Assistant, predates that architecture entirely. Cited
  mainly as a working precedent for Node.js talking to pianobar's FIFO,
  matching this project's own Node/TypeScript choice, even though its
  direct-control architecture (no message bus) isn't the one being built
  here.
- [Crewski/pianobar-mqtt](https://github.com/Crewski/pianobar-mqtt) — a
  README and license only; no actual code exists in the repo. Not a real
  implementation to learn from.
- [Home Assistant MQTT integration](https://www.home-assistant.io/integrations/mqtt/) —
  confirms `media_player` is not a natively-discoverable MQTT component,
  which is why this spec's HA entity plan uses `sensor`/`button`/`select`/
  `image` instead of a unified player widget (see
  `notes/dev/bridge-daemon-spec.md` for the fuller reasoning).

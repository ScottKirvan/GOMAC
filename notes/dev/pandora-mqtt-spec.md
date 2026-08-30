# Pandora / pianobar MQTT Adapter — Design Spec

The first concrete adapter built on `bridge-daemon-spec.md`'s general
pattern, and the first implementation of that doc's generic "Media Player"
adapter contract. This doc covers pianobar specifically: what's already
running, the full command/telemetry surface pianobar exposes, and which
parts of that surface a FIFO-and-`event_command`-based bridge can actually
drive reliably today versus what needs more infrastructure later.

**The daemon and this adapter are fully functional with zero Home
Assistant involvement** — see `bridge-daemon-spec.md`'s HA section. HA
entities described below are a free-riding presentation layer on top of
messages the adapter sends regardless.

## Current State (verify against `compute-hub-current-state.md`, not just here)

- pianobar is installed and running on TheFlea (`/usr/bin/pianobar`,
  version 2024.12.21), authenticated, playing over Bluetooth to a JBL GO 2
  speaker.
- Config (`~/.config/pianobar/config`, credentials excluded here):
  `fifo = /home/scott/.config/pianobar/ctl`, `control_proxy =
  http://127.0.0.1:8118/`. **No `event_command` is currently set** — this
  is a prerequisite gap, see below.
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

## Deployment Prerequisite: Enabling `event_command`

pianobar only reads its config at startup — adding `event_command =
<path>` requires quitting and relaunching pianobar, which will interrupt
whatever's currently playing. This needs to happen as a deliberate,
scheduled step when this adapter is actually built, not silently — flagging
it here so it isn't discovered as a surprise mid-implementation.

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

## HA Entity Plan

One HA device (per `bridge-daemon-spec.md`'s convention — its own
`identifiers`, not folded into a larger device), entities:

- `sensor` — now-playing title, artist, album, station name, rating
- `image` — album art, sourced from the `coverArt` field
- `button` — skip, love, ban, tired, play, pause, volume up, volume down (Tier 1 only)
- `select` — station (Tier 2, populated from `usergetstations`)

Tier 3 actions are **not** exposed as HA entities in this version — they
aren't reliably drivable yet (see above), so there's nothing to wire up.

## Generic Media-Player Contract Mapping

Per `bridge-daemon-spec.md`'s "Media Player" adapter type:

| Generic command | pianobar mechanism |
|---|---|
| `play` | `P` via FIFO |
| `pause` | `S` via FIFO |
| `next` | `n` via FIFO |
| `previous` | **Not supported by pianobar at all** — no "previous track" keybinding exists. A real limitation of the backend, not a gap in this adapter. Worth knowing if this contract is ever compared against a backend that does support it. |
| `select_source` | `s` + station number via FIFO (Tier 2) |
| `volume_up` / `volume_down` / `volume_set` | `)` / `(` / — via FIFO. No `volume_set` equivalent — pianobar only exposes relative nudges (`)`/`(`) and a reset (`^`), not an absolute level; `volume_set` is unsupported for this adapter. Also note (per `bridge-daemon-spec.md`): this is pianobar's own internal gain correction, not device/system volume. |
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
  `bridge-daemon-spec.md` for the fuller reasoning).

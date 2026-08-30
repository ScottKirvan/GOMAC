# GOMAC Bridge Daemon — Design Spec

This is the design spec for **the GOMAC bridge daemon** — a general-purpose
pattern for connecting local services (pianobar today; other things later)
to MQTT, so they can be controlled and monitored the same way everything
else in GOMAC is. It sits alongside `gomac-hub-spec.md` (the hub's own
design) as a second, earlier piece of application code for this repo — the
hub's toolset will likely end up calling into bridges like this one rather
than duplicating their logic. Where `pandora-mqtt-spec.md` covers the first
concrete adapter (pianobar) in detail, this doc covers the shape every
adapter shares.

## Motivation

This isn't a one-off for Pandora. The shape — some local service needs a
command surface and a telemetry surface on MQTT, with Home Assistant
picking up telemetry via discovery — is recurring: pianobar today, likely
more integrations later. `victron-ble-monitor.py` already does a version of
this by hand (see `compute-hub-current-state.md`). Worth generalizing now
that a second instance exists, rather than hand-copying the pattern again
each time — the same reasoning `gomac-hub-spec.md` already applies to
extracting shared code from BojuBot.

## One Daemon, Not One Process Per Service

**Decided: a single mono-daemon process hosting multiple adapters
internally**, not a separate OS process per integration. Reasoning weighed:

- **Against separate processes**: N long-running processes each carry their
  own baseline memory, their own systemd unit, their own dependency tree to
  patch, and their own way to silently die — real ops overhead on a shared
  8GB Pi that's also running HA, Mosquitto, Whisper, and eventually the hub
  itself, and overhead that grows with every new integration.
- **For separate processes**: real fault isolation — a hang in one adapter
  can't take another down. MQTT already provides the decoupling a shared
  process would otherwise buy you (nothing requires one process to share a
  bus), so this benefit is partially available either way.
- **Decided in favor of mono-daemon** for the reuse promise it makes
  possible: heartbeat monitoring, load/unload, list/start/stop/restart, all
  as one coherent management surface, achievable in-process far more simply
  than by orchestrating N systemd units remotely. This is only safe given
  the two rules below — without them, the fault-isolation concern above is
  a real regression, not a false alarm.

### Required adapter discipline (non-negotiable, not aspirational)

1. **Async I/O only.** Node's event loop is single-threaded — a blocking
   call or an uncaught exception in one adapter can freeze or crash the
   *entire* daemon, not just that adapter, defeating the whole point of
   independent load/unload/restart. Every adapter's I/O must be
   non-blocking, and every adapter's errors must be caught at its own
   boundary and reported as "this adapter crashed" rather than propagating
   up and taking the daemon with it.
2. **Escape hatch for OS-level isolation.** Not every future integration
   will be safe to trust fully in-process forever — something flaky enough
   (a wedged subprocess, a driver prone to hanging) may eventually need real
   process isolation. The adapter registry should be designed so a specific
   adapter *could* run as a child process under the hood without changing
   the daemon's external management surface (still shows up in
   `list`/`restart`/etc.) — not built now, just not architected away.

## MQTT Identity & ACL Model

The daemon connecting as one shared MQTT identity for all its adapters does
**not** mean everything on the bus is one trust domain. Three separate
concerns:

- **The daemon's own identity** — one connection, one credential, used
  internally by every adapter it hosts. Topic-scoped Mosquitto ACLs can
  still restrict what that identity may publish/subscribe to, independent
  of how many adapters share the connection.
- **Home Assistant's identity** — broader than any single adapter needs.
  HA is staying in the loop as both the automation/rules engine and a
  backup settings interface (decided in this design session, see
  `gomac-project-overview.md` for the product-level rationale once this is
  folded in there), so its credential needs read access across every
  adapter's state/discovery topics and write access to every adapter's
  command topics — the most broadly-privileged client on the bus after the
  daemon itself.
- **Per-app identities** — the phone/KMP app (and anything like it later)
  should get its own scoped credential, narrower than HA's, limited to what
  that specific app actually needs.

This mirrors the existing precedent of a per-service MQTT user (e.g. the
`victron` user `victron-ble-monitor.py` already authenticates as) — the
mono-daemon doesn't have to abandon that, it just means "per-service" now
means "per external consumer of the bus," not "per adapter inside the
daemon."

## Topic Namespace Convention

- **Commands**: `gomac/<adapter>/cmd` — JSON payload (e.g.
  `{"action": "skip"}`), not raw single-character keybindings. Keeps the
  MQTT-facing contract stable even if an adapter's underlying control
  mechanism changes later (FIFO today, something else tomorrow).
- **State**: `gomac/<adapter>/state/<metric>` — retained, plain-value
  payloads, mirroring the convention `victron-ble-monitor.py` already
  established (`victron-ble/<mac>/<metric>`), which keeps HA sensor mapping
  trivial.
- **Availability**: `gomac/<adapter>/availability` — birth/last-will (LWT).
  Missing entirely from both `victron-ble-monitor.py` and
  `pianobar-mpris-bridge.py` today — a real gap, since there's currently no
  way to tell a bridge died vs. is just quiet. Every adapter under this
  daemon gets one from the start.
- **HA discovery**: `homeassistant/<component>/<object_id>/config` — same
  mechanism already proven live by `victron-ble-monitor.py` (confirmed
  working against Mosquitto and HA's entity registry during this design
  session).

## Home Assistant Device/Entity Conventions

**HA is a consumer of the daemon's MQTT interface, not a dependency of
it — the daemon and every adapter are fully functional with zero HA
involvement.** "An HA device" isn't a second thing to build: it's a
`device: {identifiers: [...], name: ...}` block inside the same
discovery-config messages the daemon already publishes. HA reads that
metadata and groups the resulting entities under one device in its own UI;
that's the entire extent of what "the HA device" means. There's no
HA-side code, no HA-side state, nothing that could make the daemon depend
on HA being present. Disable discovery-publishing entirely and nothing
about command/state functionality changes — the app keeps working
identically, HA just stops seeing entities. This is why keeping HA "in the
loop" (as automation-rules engine and backup settings surface, see
`gomac-project-overview.md`) costs nothing: it's a free rider on messages
already being sent, never a gate on anything working.

Each adapter registers as its **own** HA device (own `identifiers` value in
its discovery `device` block) — not folded into one van-wide device.
Considered and rejected: one mega "Gomtuu" device holding every entity from
every adapter. Keep it simple and revisit only once more than two adapters
exist to actually observe a real pattern from, rather than designing a
universal taxonomy speculatively now.

Entities are of mixed type depending on the adapter's needs — `sensor` for
read-only telemetry, plus whatever controllable types apply
(`button`/`select`/`image`/etc.) so HA functions as a genuine secondary
control surface, not just a read-only dashboard tile. See
`pandora-mqtt-spec.md` for a concrete instance of this.

**Home Assistant has no native `media_player` MQTT-discovery component** —
verified directly against HA's own MQTT integration docs during this design
session (the natively-discoverable domains are things like `sensor`,
`button`, `select`, `switch`, `image`, etc.; `media_player` is not among
them). Getting a real unified media-player widget (transport controls +
progress bar + album art as one card) would require either an unofficial
third-party custom component or a from-scratch custom HA integration —
neither pursued here. Practical consequence: HA gets the native best-effort
entity set for any media-type adapter (`sensor` + `button` + `select` +
`image` for cover art), while a real unified player experience is left to
purpose-built clients (see "Media Player" Adapter Type below).

## The "Media Player" Adapter Type

A specialized adapter contract for anything that plays audio, defined
generically rather than tied to pianobar specifically:

- **Commands**: `play`, `pause`, `next`, `previous`, `select_source`
  (station/playlist/channel — vocabulary varies by backend, the command
  doesn't), `volume_up`, `volume_down`, `volume_set`, `rate` (like/dislike),
  `seek`, `set_playback_speed`
- **State**: now-playing metadata (title, artist, album, source name),
  album art (URL or reference), available sources list, current volume,
  current rating

Not every backend implements every verb — `select_source` and `previous`
already have a known gap (pianobar can't go back a track at all), and the
same applies to `seek`/`set_playback_speed` (no scrubbing within a
radio-style stream) below. A contract verb existing doesn't obligate every
adapter to support it; see `pandora-mqtt-spec.md`'s mapping table for how
an adapter documents which verbs it does and doesn't implement.

**A base contract richer than any single adapter fully implements is fine
— stubbing unsupported verbs is the expected shape, not a smell.** A
contract with zero gaps across its first implementation would actually be
the warning sign: it'd mean the interface was drawn to fit that one
adapter rather than a genuine cross-backend shape. The thing to actually
watch for when extending this contract later is the *ratio* — a base
interface where most adapters stub most verbs means it was designed for
speculative future backends instead of real ones. Grow the contract when a
verb is shared by backends that actually exist or are actually planned,
not preemptively.

One nuance worth keeping explicit rather than assuming away: **`volume`
means whatever level control the backend actually exposes**, not
necessarily device/system volume. pianobar's volume controls are its own
internal ReplayGain-style correction, separate from whatever the audio
device's actual output level is — the contract shouldn't quietly conflate
the two.

`rate` is deliberately scoped as a generic two-state like/dislike, since
that's roughly universal across streaming platforms (Spotify, YouTube
Music, Pandora, etc. all have some form of it). A backend can still expose
richer states beyond that as its own bespoke commands, the way pianobar's
`tired` (ban-for-one-month, a third state beyond simple like/dislike) does
— not every extra state a backend has needs to be forced into the generic
contract.

pianobar is the **first** implementation of this contract, detailed in
`pandora-mqtt-spec.md`. The point of defining the contract at this level:
a future Plex adapter, internet-radio adapter, or anything else satisfying
the same shape could plug in without the app or HA's entities needing to
change — this is the generalization Scott has wanted to build for years,
scoped here as "shape the contract right," not "build every backend now."
Only the pianobar adapter is in scope for actual implementation at this
stage.

## Network Exposure

**Current state (verified directly on TheFlea during this design
session)**: Mosquitto's listener is bound to `127.0.0.1` only —

```
listener 1883 127.0.0.1
allow_anonymous false
password_file /etc/mosquitto/passwd
```

Not reachable over LAN or Tailscale at all today. This is fine for
`victron-ble-monitor.py` and HA, both local to TheFlea, but it directly
blocks this whole feature — the KMP app runs on a phone, off-box, and as
configured today it cannot reach the broker at all.

**Needed**: widen Mosquitto's listener to LAN + Tailscale (not open
internet), firewalled with the same nftables pattern already protecting
HA's port 8123 (the `fw_homeassistant` table). Same trust boundary,
extended to Mosquitto's port. This also matches how an ESP32/ESPHome-style
node would expect to reach the broker — LAN-local, not remote — while the
phone app needs both LAN (in-van) and Tailscale (away). **Not yet done** —
a real prerequisite for the app-control half of this project, tracked here
so it isn't silently assumed solved.

## Repo Layout

One deployable daemon project, not one top-level directory per integration:

```
GOMAC/
└── bridge-daemon/
    ├── src/
    │   ├── core/           # MQTT client, adapter registry, heartbeat,
    │   │                   # lifecycle management (load/start/stop/
    │   │                   # restart/unload/list)
    │   └── adapters/
    │       └── pandora/    # first adapter — see pandora-mqtt-spec.md
    ├── package.json
    └── ...
```

## Language / Runtime

**TypeScript/Node** — matches the GOMAC hub's own already-decided runtime
(`gomac-hub-spec.md`), and there's no pull toward anything else here: unlike
`victron-ble-monitor.py` (Python, for BLE hardware library access via
`bleak`/`victron-ble`), nothing about this daemon's adapters needs Python's
hardware ecosystem. Using Node also means `bridge-daemon`'s shared core can
be directly imported by the hub later, not just structurally resemble it.
This is a real fork from the existing precedent (both scripts currently
deployed on TheFlea are Python) — flagged explicitly rather than assumed;
existing scripts are not being migrated as part of this work.

## Open Questions

- [ ] Exact Mosquitto ACL file format/granularity for the three identity
  tiers (daemon / HA / per-app) described above — not yet designed, just
  the requirement is captured
- [ ] Whether/when `victron-ble-monitor.py` gets migrated into this
  framework as an adapter, or stays a standalone script indefinitely
- [ ] Timing: does the Mosquitto listener widening (LAN + Tailscale) happen
  as prep work before the Pandora adapter is built, or alongside it
- [ ] Whether the daemon's own adapter-management surface (list/start/
  stop/restart) is itself exposed over MQTT (consistent with everything
  else) or some other mechanism

## References & Prior Art

- `gomac-hub-spec.md` — the hub's own design; likely future consumer of
  this daemon's adapters as tools
- `compute-hub-current-state.md` — what's actually running on TheFlea
  right now, including the two existing hand-rolled bridge scripts this
  pattern generalizes from
- [Home Assistant MQTT integration](https://www.home-assistant.io/integrations/mqtt/) —
  confirms the natively-supported MQTT discovery component list and the
  absence of `media_player` among them

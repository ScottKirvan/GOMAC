# GOMAC Bridge Daemon Conventions

This is the shared design spec for **GOMAC bridge daemons** — the shape any
daemon follows that connects a local service (pianobar today; other things
later) to MQTT, so it can be controlled and monitored the same way
everything else in GOMAC is. It sits alongside `gomac-hub-spec.md` (the
hub's own design) as a second, earlier piece of application code for this
repo — the hub's toolset will likely end up calling into bridges like this
one rather than duplicating their logic. Where `src/integrations/pianobar/notes/pandora-mqtt-spec.md`
covers the first concrete daemon (pianobar) in detail, this doc covers the
conventions every daemon follows: topic naming, MQTT identity/ACL model, HA
discovery conventions, and the generic Media Player contract.

## Motivation

This isn't a one-off for Pandora. The shape — some local service needs a
command surface and a telemetry surface on MQTT, with Home Assistant
picking up telemetry via discovery — is recurring: pianobar today, likely
more integrations later. `victron-ble-monitor.py` already does a version of
this by hand (see `compute-hub-current-state.md`). Worth documenting the
shared conventions now that a second instance exists, rather than
hand-copying the pattern again each time — the same reasoning
`gomac-hub-spec.md` already applies to extracting shared code from BojuBot.
This doc captures *conventions*, not a shared runtime — see Process Model
below for why those are different things.

## Process Model

**Decided (revised): one daemon process per non-trivial integration** —
pianobar gets its own standalone daemon, not a slot in a shared host
process. Revisit this once a second non-trivial daemon actually exists to
learn from, not before — the same discipline already applied to HA device
modeling and adapter "type" contracts elsewhere in this doc: don't design
a shared shape speculatively from a single instance.

**This reverses the original decision recorded in this doc** (a single
mono-daemon hosting multiple adapters internally). That decision came from
an outside spec review (GitHub issue #22) that found it lacked any
technical enforcement — the "adapters must be async-only, must catch their
own errors" rule was the *entire* safety mechanism preventing one bad
adapter from freezing or crashing every other adapter sharing its event
loop, with nothing backing it up. The review's proposed alternative — a
systemd template unit (`gomac-adapter@.service`) plus a thin CLI wrapping
`systemctl start/stop/restart gomac-adapter@<name>` — would have gotten
equivalent list/start/stop/restart management using existing
infrastructure, with real OS-level fault isolation instead of a
discipline-only rule. Reconsidered further and simplified past even that:
with only one daemon in scope right now, there's no multi-adapter
management surface to build at all yet, template unit or otherwise — plain
`systemctl start/stop/restart` on a single ordinary unit already covers it.
The mono-daemon's actual appeal (heartbeat/list/start/stop/restart as one
coherent surface, cheaper footprint than N processes) only starts to
matter once there's a second daemon to manage — that's the trigger for
revisiting this, not a timeline.

This also resolves issue #22's core risk outright rather than mitigating
it: with nothing else sharing the process, there's no cross-adapter fault
domain for a hang or an unhandled error to threaten. The async-I/O-hygiene
practice from the original draft is still just good Node practice, but
it's no longer load-bearing safety infrastructure — dropped from this doc
as a "non-negotiable rule" accordingly.

## MQTT Identity & ACL Model

Three separate concerns, independent of how many daemons exist:

- **Each daemon's own identity** — its own connection, its own credential,
  scoped to its own topic namespace via Mosquitto ACLs. Mirrors the
  existing precedent of a per-service MQTT user (e.g. the `victron` user
  `victron-ble-monitor.py` already authenticates as) — one daemon, one
  identity, one namespace.
- **Home Assistant's identity** — broader than any single daemon needs.
  HA is staying in the loop as both the automation/rules engine and a
  backup settings interface (decided in this design session, see
  `gomac-project-overview.md` for the product-level rationale once this is
  folded in there), so its credential needs read access across every
  daemon's state/discovery topics and write access to every daemon's
  command topics — the most broadly-privileged client on the bus after the
  daemons themselves.
- **Per-app identities** — the phone/KMP app (and anything like it later)
  should get its own scoped credential, narrower than HA's, limited to what
  that specific app actually needs.

## Topic Namespace Convention

"Adapter" below means the same thing as "daemon" per the Process Model
above — each is its own standalone process, but still fills the adapter
role (local service ↔ MQTT) these conventions describe.

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
  way to tell a bridge died vs. is just quiet. Every daemon gets one from
  the start.
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
`src/integrations/pianobar/notes/pandora-mqtt-spec.md` for a concrete instance of this.

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
adapter to support it; see `src/integrations/pianobar/notes/pandora-mqtt-spec.md`'s mapping table for how
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
`src/integrations/pianobar/notes/pandora-mqtt-spec.md`. The point of defining the contract at this level:
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

**Per issue #23's ordering fix: this cannot happen before the ACL policy
below is actually applied.** Widening the listener onto a broker with no
real ACL (every authenticated user has full access to every topic today —
verified directly, no `acl_file` line is active in TheFlea's Mosquitto
config despite `/etc/mosquitto/aclfile.example` existing) would mean any
device on the LAN/tailnet holding any one of the existing credentials
could read or publish anything, not just its own daemon's topics.

### ACL Policy (designed, not yet applied)

Real Mosquitto ACL file syntax, covering every identity that exists on
the broker today plus the slot reserved for the future app credential —
introducing an `acl_file` at all is default-deny for anyone not matched
by a rule, so every existing identity needs an explicit entry or it loses
access it currently has:

```
user victron
topic write victron-ble/#
topic write homeassistant/sensor/victron_+/+/config

user mediaplayer
topic readwrite mediaplayer/#

user pianobar
topic readwrite gomac/pandora/#
topic write homeassistant/+/gomac_pandora_+/config

# Future: a scoped credential for the KMP app once it exists (Phase 4's
# app-integration half). Same shape as the daemon's own scope --
# deliberately not "add pianobar-app to the daemon's rule block" as one
# shared identity, since the app and the daemon are different trust
# levels even though they touch the same topics today.
# user pianobar-app
# topic readwrite gomac/pandora/#

user homeassistant
topic readwrite #
```

`homeassistant` gets unrestricted access deliberately, not by omission —
per this doc's MQTT Identity & ACL Model above, HA is meant to be the
most broadly-privileged client on the bus after each daemon itself, since
it needs to discover and act on any current or future daemon's topics
without this ACL file needing an edit every time a new daemon is added.

**Not yet applied to TheFlea** — per the domain-separation model
(`compute-hub-current-state.md`), activating this (and the listener
widening above) is a system change for Scott's IT agent, not something a
GOMAC session executes directly.

## Repo Layout

Per the Process Model above: **one project per daemon**, not a shared host
with adapters nested inside it. Each is still its own standalone
process/deployable — this is about directory organization, not sharing a
runtime. Daemons live under `src/integrations/`, keeping the repo root
clean rather than scattering top-level project folders:

```
GOMAC/
└── src/
    └── integrations/
        └── pianobar/      # first daemon — see src/integrations/pianobar/notes/pandora-mqtt-spec.md
            ├── package.json
            └── ...
```

A second non-trivial daemon is the trigger to revisit whether a shared
core package (MQTT bootstrap, HA-discovery builder) is worth factoring
out between them — not before, per the Motivation section above.

## Language / Runtime

**TypeScript/Node** — matches the GOMAC hub's own already-decided runtime
(`gomac-hub-spec.md`), and there's no pull toward anything else here: unlike
`victron-ble-monitor.py` (Python, for BLE hardware library access via
`bleak`/`victron-ble`), nothing about pianobar control needs Python's
hardware ecosystem. Using Node also means a future shared core package (see
Repo Layout above) could be directly imported by the hub later, not just
structurally resemble it. This is a real fork from the existing precedent
(both scripts currently deployed on TheFlea are Python) — flagged
explicitly rather than assumed; existing scripts are not being migrated as
part of this work.

## Open Questions

- [x] Exact Mosquitto ACL file format/granularity for the three identity
  tiers (daemon / HA / per-app) described above — designed, see Network
  Exposure's "ACL Policy" section. Not yet applied to TheFlea (that's a
  change-doc request for Scott's IT agent, per domain separation).
- [ ] Whether/when `victron-ble-monitor.py` gets rewritten as a
  conventions-following daemon of its own, or stays a standalone script
  indefinitely — same "wait for real signal" discipline as the process
  model decision above
- [ ] Timing: does the Mosquitto listener widening (LAN + Tailscale) happen
  as prep work before the Pandora daemon is built, or alongside it — see
  the ordering dependency noted above
- [x] Whether a shared multi-daemon management surface (list/start/stop/
  restart) is needed now — no, resolved by the Process Model decision
  above: one daemon in scope today, plain `systemctl` covers it, revisit
  with a second daemon
- [x] Whether to adopt a custom **config-entry-based** HA `media_player`
  integration instead of the sensor/button/select/image fallback below
  (GitHub issue #24) — **decided: no, stick with the native sensor/button/
  select/image entities.** The ad hoc TheFlea-side integration proved a
  unified player card is feasible, but Scott's call was that separate
  entities are fine as long as they give real control and land under one
  device — both already true of this plan (see Home Assistant Device/
  Entity Conventions above). Simpler, no HA-side plugin code to write or
  maintain, at the cost of a scattered dashboard instead of one card.

## References & Prior Art

- `gomac-hub-spec.md` — the hub's own design; likely future consumer of
  these daemons as tools
- `compute-hub-current-state.md` — what's actually running on TheFlea
  right now, including the two existing hand-rolled bridge scripts these
  conventions generalize from
- [Home Assistant MQTT integration](https://www.home-assistant.io/integrations/mqtt/) —
  confirms the natively-supported MQTT discovery component list and the
  absence of `media_player` among them
- GitHub issue #22 — outside spec review that found the original
  mono-daemon design's fault-isolation story was discipline-only with no
  enforcement; drove the Process Model reversal above
- GitHub issue #23 — outside spec review that caught the ACL/listener
  ordering dependency noted above
- GitHub issue #24 — outside spec review flagging the ad hoc TheFlea
  media_player integration; see `src/integrations/pianobar/notes/pandora-mqtt-spec.md`

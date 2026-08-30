# Compute Hub — Current State & Access

This doc bridges `gomac-project-overview.md`'s design ("what and why") and
`gomac-hub-spec.md`'s implementation spec ("how") with what's *actually
running* on the physical hardware right now. Design docs describe intent;
this one describes reality, and will drift out of date the moment
something changes — verify against the live machine before trusting a
claim here, don't just cite this file. Written 2026-08-29 for a new agent
being briefed onto this project, so it can go look at things itself
instead of taking this doc's word for it.

**TheFlea** is the name of the physical 8GB Raspberry Pi 5 that is this
project's compute hub — see System Architecture in
`gomac-project-overview.md`. It also carries its own IT/DevOps history
(security hardening, connectivity monitoring, etc.) predating this
project, tracked separately and not duplicated here.

## Domain separation — how this gets worked going forward

Scott deliberately keeps two separate working domains, each with its own
agent session and its own rules: **TheFlea** (an ongoing IT/DevOps
context — hardening, telemetry collectors, general machine upkeep) and
**GOMAC** (this repo — design/spec phase, its own `CLAUDE.md`: branches +
PRs, no AI attribution, tests once code exists). He's now actively
starting to enforce that separation in practice, having spent 2026-08-29
deliberately testing where the boundary breaks down.

**Why this is genuinely hard, not just a preference**: the two domains
are tightly coupled by necessity — GOMAC's actual deliverable has to run
*on* TheFlea, so testing/deploying it inherently touches TheFlea's live
system state (Mosquitto, Home Assistant, systemd). A GOMAC-focused
session that starts editing TheFlea's live config to test something
inherits TheFlea's IT-ops context it was never meant to carry, and the
reverse also happens: TheFlea-side work can end up building actual GOMAC
features informally, under the wrong rules, with no PR/review.

**Concrete example of exactly that happening**: earlier the same day this
doc was first written, a TheFlea-side session built a working custom
Home Assistant `media_player` integration
(`media_player.audio_feed_media_player`, device "Audio Feed") for
pianobar/Pandora control — real, deployed, working — entirely outside
this repo, under TheFlea's rules, not GOMAC's. That's now the same
problem `src/integrations/pianobar/notes/pandora-mqtt-spec.md`'s Pandora adapter is designing "for
real," in TypeScript, as part of `bridge-daemon-spec.md`'s daemon. These
two will need reconciling once the real adapter is built — most likely
retiring the ad hoc TheFlea-side integration in favor of the designed
one, not running both. **Don't assume the ad hoc integration is gone or
current** — check `/opt/homeassistant/config/custom_components/mediaplayer_mqtt/`
on TheFlea directly if this matters to what you're building.

**The working model going forward**: GOMAC code and design decisions
stay in this repo, built through GOMAC-focused sessions, following this
repo's own rules fully. The only thing meant to cross into TheFlea's
domain is a narrow, explicit deployment step — not an agent freely
making live system changes on TheFlea mid-development the way the
example above happened. What exactly that deployment contract looks like
(a script, a doc, something else) isn't decided yet — flagging the
principle here since it's now the intended direction, not the mechanism.

## Hardware reality check

- **8GB Pi 5 = TheFlea = the compute hub.** Confirmed 2026-08-07. This is
  the box everything below runs on.
- **1GB Pi 5 = the intended display/UI node.** Confirmed as the plan
  2026-08-07. **Not yet provisioned at all** — no OS setup, no display
  strategy implemented, just sitting as a bare board. Don't assume it's
  reachable on the network or doing anything yet.
- **Second USB WiFi adapter** (Edimax N150, RTL8188EU chipset) is
  physically plugged into TheFlea and confirmed working at the driver
  level (scans, sees networks). **Not configured for anything yet** — the
  planned AP-mode local hub (`hostapd`, so other onboard systems can join
  a network TheFlea broadcasts) has not been built. `hostapd` isn't even
  installed.

## What's actually running on TheFlea right now

- **Home Assistant** — `ghcr.io/home-assistant/home-assistant:stable`,
  Docker Container mode (not HAOS, per the decision in
  `gomac-project-overview.md`). Reachable at `http://<TheFlea-tailscale-ip>:8123`
  from anywhere on the tailnet, or `http://<TheFlea-LAN-ip>:8123` when on
  the same local network. Firewalled via nftables (an `fw_homeassistant`
  table) to LAN + Tailscale ranges only — not exposed to the open
  internet despite TheFlea having a public IPv6 address. **Set up outside
  any agent-assisted session that has visibility into it** — nobody
  currently has a written record of *how* it was configured beyond "it's
  the stock container image." Mosquitto **is** running and feeding it
  real data (see the Victron bullet below) — but no automations, no
  dashboards built yet as far as anyone tracking this doc knows — check
  the HA UI directly rather than assuming either way.
- **Victron BLE telemetry → MQTT → Home Assistant is real and working.**
  `victron-ble-monitor.py` (systemd timer, runs every minute) passively
  scans BLE for Gomtuu's Victron gear (MPPT solar charger, Orion DC-DC
  charger, AC charger — see `Gomtuu Van Specs.md`), and as of an
  2026-08-16 update **publishes each reading to the local Mosquitto
  broker** (`victron-ble/<mac>/<metric>` topics) with proper Home
  Assistant MQTT-discovery config topics
  (`homeassistant/sensor/victron_<mac>_<metric>/config`) — so HA
  auto-creates the entities with no manual YAML. Confirmed live: **16
  Victron sensor entities exist in HA's entity registry right now**
  (`sensor.mppt_100_15_solar_charger_battery_voltage` and similar), and
  Mosquitto's logs show the collector connecting and publishing every
  minute. It also still writes the same data to
  `/var/log/victron-ble/victron.csv` in parallel (long-format:
  timestamp, device, metric, value) — that CSV isn't a rejected/orphaned
  path, it's a still-live secondary consumer (feeds a daily ops email
  unrelated to this project). **This closes the gap this doc's first
  draft flagged as unresolved** — don't assume it's still open; verify
  against `/usr/local/sbin/victron-ble-monitor.py` and Mosquitto's own
  logs if this claim ever seems wrong later, the same way it was caught
  wrong here.
- **Connectivity telemetry** (`ping-monitor`) — minutely ping checks
  (8.8.8.8, 1.1.1.1, default gateway), logged to
  `/var/log/ping-monitor/ping.csv`. Useful if you need to reason about
  whether TheFlea's own internet connectivity was up/down at a given
  time — unrelated to Gomtuu's Starlink dish stats specifically (see
  below).
- **Starlink dish stats** — reachable live from TheFlea via the dish's
  local gRPC API (`192.168.100.1:9200`, community library
  `starlink-grpc-core` on PyPI) when TheFlea is on the Starlink-provided
  WiFi. Not currently logged anywhere persistent — was only queried
  ad hoc so far. **GPS is not obtainable this way**: Starlink removed
  exact GPS from this API in May 2026, restricted to Priority-tier plans
  only (verified directly against the API, not assumed) — matches what
  `gomac-project-overview.md` already says; this was independently
  re-confirmed via the live hardware, not just cited from the docs.

## What's explicitly NOT running yet

Don't assume any of these exist without checking:
- ESP32 mesh nodes (none built, no firmware written)
- The GOMAC hub service itself (the Claude-Code-CLI-wrapped daemon
  described in `gomac-hub-spec.md`) — zero application code exists for
  this yet, anywhere
- Whisper / any voice pipeline
- Any Home Assistant automations (as far as anyone tracking this doc
  knows — verify directly in the HA UI)
- Victron GX hardware or VenusOS (still not owned — see
  `gomac-project-overview.md`'s Existing Hardware section)
- Anything on the 1GB display Pi
- The AP-mode local WiFi hub

## How to connect and see things yourself

- **Network**: TheFlea is reachable over Tailscale (ask Scott to add
  your agent/machine to the tailnet if it isn't already — this project
  deliberately avoids exposing anything to the open internet, see the
  Technical Constraints / "degrade gracefully offline" principle in
  `gomac-project-overview.md`). Once on the tailnet, `ping theflea` or
  ask Scott for its current Tailscale IP.
- **Home Assistant API**: needs a long-lived access token generated from
  the HA UI (Profile → Security → Long-Lived Access Tokens) — ask Scott
  for one or generate your own once you have UI access; none is recorded
  in this repo on purpose.
- **SSH to TheFlea**: ask Scott directly for access — not something to
  assume or that's documented here.
- **Victron/ping CSVs**: plain files at the paths above, readable once
  you have any shell access to TheFlea.
- **This repo's own conventions** (branching, no AI attribution in
  commits, etc.) are in the root `CLAUDE.md` — read that before making
  any changes here, it applies regardless of which agent/tool you are.

## Open items worth knowing about before you go build something

- The one-box-vs-two-box question (does TheFlea end up running
  *everything*, or does real load eventually force splitting roles
  across the two Pis) isn't fully settled by usage yet — it's only
  settled on paper.
- The freed-up 1GB Pi has had zero setup work done on it — if display/UI
  work is the next priority, that's a from-scratch effort, not a
  "finish what's there" one.

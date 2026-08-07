# GOMAC — Gomtuu's Automation, Telemetry, & Logistics

> *"A living ship... it needs a companion as much as Tam needs Gomtuu."*
> — Star Trek TNG, "Tin Man"

This is the main project doc for GOMAC — written for human contributors and any coding agent working in this repo, not just Claude Code (see the root [`CLAUDE.md`](../../CLAUDE.md) for repo/tooling guidance specific to that tool). Update this file's relevant sections as decisions are made and the design evolves.

## Overview

**Gomtuu** is a 2005 Mercedes T1N Sprinter built as a full-time live-aboard, off-grid, enterprise-grade remote office. **GOMAC** is the intelligent, voice-first vehicle automation and trip planning system built for her. This is infrastructure, not a weekend toy.

**Design priority: reliable first, clever second.**

The project is intended to be **open source** and configurable for other overlanders and future vehicles. A vehicle config layer abstracts hardware specifics so the same software stack runs on different rigs.

**No purchases or commitments have been made yet.** All architecture and hardware choices are still in design/spec phase.

**Naming note:** "GOMAC" names both the overall project and, specifically, the hub component described under System Architecture below — the standalone service you actually talk to, the same way "BojuBot" names both that whole Obsidian plugin and the agent persona inside it. That's not an accident: **this repo's primary deliverable is the GOMAC hub itself.** Home Assistant, MQTT, and the ESP32 firmware are supporting infrastructure GOMAC talks to over their own APIs/MQTT — glue this project depends on, not code built in this repo. Where the distinction between "the project" and "the hub" matters in writing, this doc says "the GOMAC hub"; otherwise "GOMAC" means either interchangeably, same as day-to-day conversation would.

## Goals

1. **Intelligent ambient awareness** — the van knows its state and anticipates needs
2. **Voice-first interaction** for quick/ambient queries
3. **Screen-based resolution** for complex tasks (trip planning, comparisons, options)
4. **Multi-variable trip planning** — the primary unsolved problem this replaces manual tool-wrangling for
5. **Resource management** — water, grey water, power, inventory
6. **Predictive maintenance** — especially for known T1N failure points
7. **Open source and configurable** — a vehicle config layer abstracts hardware specifics so others can run the same stack on their own rigs

## System Architecture

```
┌─────────────────────────────────────────┐    ┌──────────────────────┐
│           Claude (intelligence)          │    │  Public Travel Site  │
│   planning · decisions · NL interface   │    │  live stats · map    │
├─────────────────────────────────────────┤    │  journal · followers │
│       Home Assistant (automation)        │───▶│                      │
│    devices · sensors · rules · UI       │    │  (cloud-hosted)      │
├─────────────────────────────────────────┤    └──────────────────────┘
│            MQTT (message bus)            │
│        everything talks here            │
├──────────────────┬──────────────────────┤
│   ESP32 nodes    │   Compute Hub         │
│  sensors/control │  laptop → 2× RPi      │
└──────────────────┴──────────────────────┘
```

| Layer | Technology | Role |
|---|---|---|
| Edge sensors/control | ESP32 (mesh) | Tanks, environment, lighting, locks, motion/occupancy (PIR), etc. |
| Power monitoring | Victron GX | Battery SOC, solar input, load, charger state — feeds MQTT |
| Compute hub (progression) | Laptop (prototyping) → 2× Raspberry Pi (production) | Runs HA, MQTT, Whisper, GOMAC, display/UI — see "Compute Hub" below |
| Automation backbone | Home Assistant (Container/Docker, **not** Home Assistant OS) | Device integration, dashboards, automations |
| Message bus | MQTT (Mosquitto) | All inter-device communication |
| **GOMAC (the hub)** | Standalone service wrapping Claude Code CLI / Claude Agent SDK | Reasoning, planning, NL understanding — the component you actually talk to; see "GOMAC — the Hub" below |
| Voice pipeline | Whisper → Claude → TTS | Voice-first interaction |
| Remote access | Tailscale VPN | Secure remote access to Home Assistant without port forwarding |
| Public-facing site | Cloud-hosted web app | Live travel stats, location, journal — outbound only |

**Compute Hub**: production hardware is **two Raspberry Pi 5s already on hand**:
- **8GB Pi 5** — primary compute: Home Assistant (Container, not HAOS — see below), Mosquitto, Whisper, GOMAC
- **1GB Pi 5** — dedicated display/UI node (RAM-constrained for a kiosk browser — see Existing Hardware / Open Questions)

No Jetson is currently planned. (Previously the plan was Laptop → RPi → Jetson; the Jetson step is dropped, at least for now — see Open Questions for the vision/local-LLM capabilities that were contingent on it.)

**Home Assistant install**: **HA Container (Docker), not Home Assistant OS.** HAOS is a locked-down appliance image — its Supervisor manages everything as Docker "Add-ons," and HA Core is just one of those add-ons. Packaging GOMAC as a HAOS add-on would mean building this repo's primary deliverable to fit someone else's plugin contract. Running plain HA Core in Docker on a normal OS (Raspberry Pi OS/Debian) instead lets HA be one sibling service among several — HA, Mosquitto, and GOMAC all run as peers, talking over HA's REST/WebSocket API and MQTT, the same way ESP32 nodes and the Victron GX already do. Keeps HA swappable and keeps GOMAC from being a guest in HA's house.

**GOMAC — the Hub**: a standalone service (not an HA add-on, not embedded in HA) that wraps the **Claude Code CLI** (or the Claude Agent SDK it's built on) as the reasoning engine, and exposes a small, deliberate toolset to it — e.g. `get_tank_level`, `run_automation`, `query_battery_soc`, `set_scene` — implemented as calls into Home Assistant's API/MQTT. Modeled directly on [BojuBot](https://github.com/ScottKirvan/BojuBot) (see References & Prior Art): where BojuBot wraps Claude Code CLI with a toolset for controlling Obsidian, GOMAC wraps it with a toolset for controlling Home Assistant. Wrapping the CLI/SDK rather than calling the raw Anthropic API directly means inheriting its agentic tool-use loop instead of building one from scratch. This is the component this repo exists to build — see the naming note above, and see `gomac-hub-spec.md` for the implementation-level design spec (license, multi-provider AI routing, permission model, open implementation questions).

One role worth calling out here since it's product-facing: **Puka Shell Tour Guide** — local exploration/tourist queries ("find me a dive bar nearby," "alt-culture things to do in Montreal," using current GPS location as context). Deliberately lower-stakes than GOMAC's core reasoning, which is why the hub spec designs it to potentially route to a different, cheaper AI backend rather than spend Claude usage on it. Full detail in `gomac-hub-spec.md`.

**Permission model**: borrowed from BojuBot's **security modes** (readonly / standard / full) — a dial on how much GOMAC is actually allowed to *do*, not just query. Readonly: state queries only, no side effects. Standard: pre-approved safe automations (lights, AC, scenes). Full: reserved for anything riskier, decided case by case — this is the intended mechanism for gating something like CAN-bus writes if that's ever pursued (see Open Questions), rather than a blanket yes/no.

**Remote access**: Tailscale is the planned route for secure remote access to Home Assistant from outside the van's local network, without opening ports.

## UX Model: Voice-First with Modal Escalation

**Ambient / quick queries** → voice in, voice out
- "How's our water situation?"
- "Can we run the AC tonight?"
- "Is there a brewery nearby?"

**Complex / planning** → voice triggers, screen resolves
- Multi-variable trip planning
- Route options with comparisons
- Resource planning across days
- Anything needing a map, timeline, or table

The system determines which mode to use — simple queries answered immediately, complex ones escalate to a display.

## Core Feature Areas

**1. Resource Management**
- **Water**: track fill events, consumption rate, current level; model days remaining; dump station routing
- **Grey water**: fill rate correlated to fresh usage; proactive alerts with nearby dump stations
- **Power**: battery SOC, solar in, loads; reason about "can we run AC tonight without killing the battery?"
- **Inventory** (future): consumables tracking, resupply planning

**2. Trip Intelligence**
The primary unsolved problem — multi-variable route planning currently requires 4-5 separate tools.

Example queries the system must handle:
- *"Is there any boondocking between here and Minneapolis we should check out?"*
- *"Find a route from Minneapolis to West Virginia where we can take our time and stay under 85°F for the next 3 weeks"*
- *"We have 40% battery, 200 miles to the next hookup, and it'll be 95° tonight — what do we prioritize?"*

Variables in play: route options, weather (temp/precip) along route, campsite availability and quality, tank levels, drive vs. explore time, budget, vehicle limitations (T1N height/weight/road type).

**3. Predictive Maintenance (T1N-specific)**
OBD data → Home Assistant → Claude reasons about trends, not just thresholds.

Known T1N failure points to monitor:
- Dual-mass flywheel (vibration, mileage)
- Glow plugs (cold start behavior, error codes)
- Fuel system (filter interval, lift pump)
- EGR / turbo (intake temps, boost pressure)
- Coolant system (temp trends, overflow level)

*Example: "Your coolant temp has been running 8° higher than baseline for the last 3 days — worth checking the thermostat before the mountain stretch."*

**4. Ambient Awareness & Automation**
- Geofencing triggers (pre-cool van before arrival)
- Lighting scenes (arrival, bedtime, movie mode, etc.)
- Load shedding based on battery SOC
- Door/lock state monitoring (door sensors TBD — see Open Questions)
- Basic motion/occupancy sensing via ESP32 (PIR-style) is part of the planned edge sensor mesh
- Vision-based occupancy/security/gesture features are a different thing and **not currently planned** (would need a vision-capable compute node, e.g. a Jetson, later) — see Open Questions

**5. Public Travel Site**
A cloud-hosted, public-facing site that follows Scott & Wendy's travels in real (or near-real) time.

- **Live location** on a map (GPS source TBD — Starlink no longer exposes GPS via its local API as of May 2026; see Open Questions)
- **System stats dashboard** — battery SOC, solar input, interior temp, water levels
- **Journal / blog** entries
- **Trip history** — past routes, places visited
- **Push pattern only** — van pushes data outbound to a cloud endpoint; nothing inbound to the van for security
- Hosted separately from in-van systems; subset of MQTT data, sanitized for public consumption
- Stack TBD (likely Next.js or similar + a cloud DB/store)

## Multi-Platform Design

The system is designed so other overlanders can run it on their own vehicles. Key abstraction:

**Vehicle config file** — defines:
- Tank capacities and sensor mappings
- Electrical topology
- ESP32 node assignments
- Vehicle-specific maintenance schedules and known issues

The intelligence layer reads config, not hardcoded assumptions. A 4Runner build and a Sprinter build run the same software with different configs.

## Data Inputs

**Real-time (ESP32 sensors)**
- Tank levels: fresh water, grey water
- Power: battery SOC, solar input, loads
- Environment: interior/exterior temp, humidity
- Vehicle: engine data (OBD), door/lock state
- Motion/occupancy (PIR-style, via ESP32 — separate from vision-based detection, which isn't currently planned)
- Location: GPS

**Human**
- Voice queries
- Geofencing / presence
- Manual overrides

**External / Web**
- Weather forecasts (route-aware, multi-day)
- Campsite availability (Campendium, iOverlander, Freecampsites)
- Points of interest (tourism, breweries, services, dump stations)
- Traffic and road conditions
- Starlink/cell coverage maps

## Build Phases

**Phase 0 — Laptop Prototyping** *(now — no van hardware needed)*
- Home Assistant in Docker on laptop
- Mosquitto MQTT broker locally
- `python-obd` → OBDLink MX+ (initial/dev OBD scanner)
- Starlink local API integration → collect & visualize dish stats, signal quality (no GPS — Starlink removed that from its local API in May 2026)
- GPS for prototyping: possibly a custom Android service reporting phone GPS, until a GPS dongle is acquired
- GOMAC prototype (Claude Code CLI/Agent SDK, wrapping HA via its API — tool use patterns)
- Define MQTT topic structure
- Define vehicle config file schema

**Phase 1 — The Nervous System** *(physical install on dedicated hardware)*
- **Compute hub: 8GB Raspberry Pi 5** — runs Home Assistant (Container, not HAOS), Mosquitto, GOMAC
- **1GB Raspberry Pi 5** — dedicated display/UI node
- ESP32 mesh network
- WiCAN Pro for OBD (when it arrives)
- Sensors: tanks, power, environment
- GPS dongle feeding HA (production GPS source — see Open Questions)
- Basic automations and dashboard working
- **Public travel site v1** — push location + basic stats to cloud, public read-only view

**Phase 2 — The Brain** *(software, requires Phase 1)*
- Voice pipeline: Whisper (local STT, on the 8GB Pi) → Claude → TTS
- Wake word integration
- Simple voice queries against local data
- Travel site v2 — richer dashboards, journal, trip history

**Phase 3 — Trip Intelligence** *(mostly software, can prototype in parallel)*
- External data integrations (weather, campsites, POI)
- Multi-variable route planning
- Resource forecasting across multi-day plans
- Predictive maintenance reasoning

## Existing Hardware (Relevant to Automation)

**Power System**
- 2x Battle Born BB10012 — 100Ah 12V LiFePO4 (200Ah total)
- Victron MPPT 100/15 solar charge controller
- 2x 220W bifacial solar panels
- Victron 12/375 pure sine wave inverter
- Victron 12/15 Blue Smart battery charger (shore power)
- Victron Orion Smart HQ2025HGAZQ DC/DC charger (alternator)
- Shore power inlet (installed)
- Coulombmeter (mounted)
- Victron GX monitoring (**not currently owned** — aspirational, part of the wider-scope spec, not a Gomtuu purchase) — Cerbo GX hardware vs. VenusOS on the 8GB Pi undecided (see Open Questions); feeds battery SOC, solar input, load, and charger state to MQTT

**Controllable Loads**
- Dimmable lighting: overheads, under-cabinet, bee lights in bedroom
- Independently powered puck lighting: garage, closet, above sink
- Waeco RSD-110 refrigerator/freezer (12V, 4A rated)
- 12V 10,000 BTU CountryModPro rooftop AC
- Diesel heater
- Water pump (pressure-based electric, on cutoff switch)
- Switch panel (partial: skynet + diesel heater done)

**Compute**
- 8GB Raspberry Pi 5 (production compute hub)
- 1GB Raspberry Pi 5 (production display/UI node) — RAM is tight for this role: a full Chromium kiosk dashboard can easily use several hundred MB to 1GB+ on its own, before the OS. A lightweight native UI toolkit (e.g. LVGL) or a stripped-down webview instead of desktop Chromium is likely the better fit — see Open Questions.

**Connectivity / Data**
- Starlink (wired, installed) — bandwidth-heavy tasks; **no longer a GPS source** — Starlink removed GPS from its local API in May 2026
- Multi-carrier cell (TBD) — low-latency API calls; fallback hierarchy TBD
- Pioneer DMH-WT3800NEX2561 head unit (CarPlay, Android Auto; backup cam not installed)
- Autel Bluetooth OBD-II scanner (deep diagnostics, T1N proprietary codes — keep)
- **OBDLink MX+** (owned) — initial/dev OBD scanner, supersedes earlier Vgate iCar Pro WiFi plan. Bluetooth (SPP/BLE), STN1170 chipset. Does standard OBD-II PID polling (request/response), **and** the chip also supports a raw CAN monitor mode (`ATMA`) — but with no native Linux SocketCAN interface, unlike WiCAN Pro; would need a custom serial-to-SocketCAN bridge to use that mode the same way. See Open Questions.
- **WiCAN Pro** — **not owned.** A decided-on plan, not a purchase — nothing bought yet. WiFi, native MQTT, raw CAN via SocketCAN out of the box, built-in HA integration; always-on data feed to MQTT broker. Its role now overlaps with OBDLink MX+'s raw CAN capability above — see Open Questions.
- GPS dongle — TBD, needed now that Starlink no longer provides GPS; a custom Android service may stand in during Phase 0 prototyping
- Tailscale VPN (planned) — secure remote access to Home Assistant without port forwarding
- USB-A and USB-C outlets in cab, bedroom, galley

**Displays**
- iPad mount (bedroom, installed) — existing display/control surface; a candidate answer for the "primary screen size/location" open question below, not yet decided as such

**Water System**
- 5 gal fresh tank + 10 gal fresh spare
- 5 gal grey tank
- Folding covered sink with pressure-based electric pump

## Technical Constraints

- **12V nominal**: 10.5V (dead LiFePO4) to 14.6V (charging)
- All nodes must tolerate automotive voltage fluctuations
- Reverse polarity protection required on all nodes
- Inductive loads (fans, pumps) need flyback diodes
- PWM dimming: >200Hz minimum, 1–20kHz preferred
- Wire gauge: follow automotive standards
- Space and thermal constraints inside a van
- Core functions must degrade gracefully when offline (no cloud)

## References & Prior Art

- [Home Assistant](https://www.home-assistant.io/)
- [ESPHome](https://esphome.io/) — ESP32 firmware that speaks Home Assistant natively
- [Mosquitto](https://mosquitto.org/) — MQTT broker
- [Whisper](https://github.com/openai/whisper) — local speech-to-text
- [iOverlander](https://www.ioverlander.com/), [Campendium](https://www.campendium.com/), [Freecampsites](https://freecampsites.net/)
- [WiCAN-PRO](https://www.meatpi.com/products/wican-pro) — production OBD/CAN adapter (see Existing Hardware above)
- [BojuBot](https://github.com/ScottKirvan/BojuBot) — Obsidian plugin wrapping Claude Code CLI with a permissioned toolset (readonly/standard/full security modes) and vault-native memory. Architectural and naming model for GOMAC (the hub) — see System Architecture above.
- [OBDLink® MX+](https://www.obdlink.com/products/obdlink-mxp/), [STN1170 chip](https://www.obdsol.com/solutions/chips/stn1170/) — confirms raw CAN (`ISO 11898`) support beyond standard OBD-II PID polling; see Open Questions for the SocketCAN-bridge gap vs. WiCAN Pro
- [Cog](https://github.com/Igalia/cog) / WPE WebKit — minimal WebKitGTK kiosk-browser stack built for embedded devices; candidate for the 1GB Pi 5's escalated display view (see Open Questions)
- [Godot 4.x on the Raspberry Pi](https://forum.godotengine.org/t/godot-4-x-on-the-raspberry-pi/34417), [Godot 4 build for Raspberry Pi 4](https://forum.godotengine.org/t/godot-4-build-for-raspberry-pi-4/47798) — community reports informing the display-tech open question below (RAM headroom, renderer compatibility)

## Open Questions

**Architecture**
- [x] Compute hub decided: Laptop (Phase 0) → 2x Raspberry Pi, 8GB (compute) + 1GB (display/UI) (Phase 1)
- [x] Raspberry Pi models confirmed: both are Raspberry Pi 5 (8GB and 1GB variants)
- [ ] Display tech for the 1GB Pi 5 — undecided, but narrowed down:
  - **Key idea**: don't hold a heavy renderer resident continuously. The UX model already says ambient/quick queries stay voice-only and only "complex" ones escalate to screen — so the display can sit idle/cheap by default and only spin up something heavier when GOMAC actually escalates to visual mode.
  - **Idle/ambient tier**: a lightweight native toolkit (e.g. LVGL) for a cheap always-on readout (battery %, tank %, clock) — single-digit MB, near-zero CPU.
  - **Escalated tier**: a minimal kiosk browser pointed at Home Assistant's own Lovelace dashboard (reuses HA's UI instead of building one), running under a minimal Wayland compositor (e.g. `cage`) with no desktop shell. Candidates: WPE WebKit via Cog (lighter, purpose-built for embedded, some GPU-driver risk on Pi) or plain `chromium --kiosk` (heavier, more reliably compatible) as fallback. Needs testing on real hardware for actual RSS numbers, not assumed.
  - **Godot, considered and set aside for the 1GB unit specifically**: has real appeal (proper dev ergonomics vs. hand-rolling LVGL screens, fits the "own your stack" preference, would talk to GOMAC/HA over MQTT/API as just another peer) — but Raspberry Pi community reports consistently put comfortable Godot 4 use at 8GB recommended / 4GB as the practical floor for simple 2D, well above 1GB. Godot's default Vulkan renderer has reported trouble even on an 8GB Pi 5; the Compatibility/GLES renderer is the safer bet. ARM64 Linux export has only existed since Godot 4.2.1 and leans on community-built export templates. Also: Godot has no built-in interactive mapping — trip-planning map views would need custom tile-texture rendering or a separate embedded webview just for that. If Godot's dev experience is wanted badly enough, the 8GB Pi (where it's reported to work comfortably) is the safer target, not the 1GB display unit.
- [ ] Victron GX monitoring is planned (battery SOC, solar input, load, charger state → MQTT) — still open whether it's standalone Cerbo GX hardware or VenusOS running on the 8GB Pi
- [ ] Vision/occupancy detection, local-LLM offline fallback — not currently planned; would require a vision/AI-capable compute node (e.g. a Jetson) added later. No commitment either way yet.
- [ ] Connectivity fallback hierarchy — auto-switching Starlink/cell logic
- [ ] GPS sourcing: Starlink no longer exposes GPS via its local API (removed May 2026). Prototyping option: a custom Android service reporting phone GPS. Production plan: a dedicated GPS dongle (model TBD, not yet acquired).
- [ ] CAN-bus writes (vehicle actuation, not just reading telemetry): no current plans, explicitly not ruled out for the future either. WiCAN Pro's SocketCAN access supports writing, not just reading. No engine tuning or automated-driving-system use is intended. If ever pursued, gate it behind GOMAC's "full" permission mode rather than exposing it by default.
- [ ] Operational memory for the deployed GOMAC hub — distinct from this design-time doc. E.g. learned state/preferences ("AC ran through the night, battery hit 40%, that was fine"). BojuBot's vault-native `_claude-context.md` is the model.

**Public Travel Site**
- [ ] Hosting / stack — Next.js + Vercel + Supabase? Static + edge functions? Self-hosted?
- [ ] Push mechanism — HA HTTP integration? Custom MQTT-to-cloud bridge? Direct webhook?
- [ ] Data subset and sanitization rules (no PII, location precision/delay for safety)
- [ ] Domain / branding
- [ ] Update cadence — true real-time vs every N minutes

**Hardware / Sensors**
- [ ] Water tank level sensing method (float, capacitive, ultrasonic?)
- [x] Initial/dev OBD scanner: OBDLink MX+ (owned) — supersedes the earlier Vgate iCar Pro WiFi plan
- [x] OBD integration for production: WiCAN Pro planned (WiFi, native MQTT, raw CAN via SocketCAN out of the box) for continuous monitoring; Autel kept for deep diagnostics. **Not purchased yet.**
- [ ] Whether WiCAN Pro is still needed, now that OBDLink MX+'s STN1170 chip is confirmed to also support raw CAN monitoring (`ATMA` mode, ISO 11898): OBDLink MX+ has no native SocketCAN interface though, so getting its raw CAN data onto MQTT the way WiCAN Pro does out of the box would mean writing and running a custom Bluetooth-serial-to-SocketCAN bridge. Could be enough to defer or skip the WiCAN Pro purchase, or could be more trouble than it's worth for an always-on production feed — undecided.
- [x] CAN bus access confirmed possible via either device for T1N reverse-engineering with SavvyCAN + DBC files: WiCAN Pro out of the box, or OBDLink MX+ with the custom bridge above
- [ ] Primary screen size/location for visual resolution mode (drives the 1GB Pi's display setup) — the existing bedroom iPad mount is a candidate, not yet decided
- [ ] ESP32 node count and placement (zone-by-zone mapping TBD)
- [ ] Door sensors (TBD) — side door (45×69"), rear door (64×73")

**Voice / UX**
- [ ] Wake word — custom or off-the-shelf (e.g., openWakeWord)?
- [ ] TTS engine selection (Piper, Coqui, ElevenLabs?)
- [ ] Whisper model size vs. 8GB Pi headroom tradeoff

**Software / Open Source**
- [ ] Repo structure and licensing
- [ ] Vehicle config file schema design
- [x] Claude integration pattern decided at a high level: a standalone hub service (named GOMAC, same as the project — see naming note above) wrapping Claude Code CLI/Agent SDK with a custom toolset, modeled on BojuBot (see System Architecture). Specific tool definitions and structured-output design still open.

## Session Log

| Date | Notes |
|---|---|
| 2026-05-15 | Session "SmartGomtuu" started. `notes/dev/CLAUDE.md` created. Reviewed all existing files. No purchases committed. Still in design/spec phase. |
| 2026-05-31 | OBD adapter decisions: WiCAN Pro (production) + Vgate iCar Pro WiFi (ordered, dev). Compute hub revised to laptop→RPi 5→Jetson progression to defer Jetson cost. Added Public Travel Site as architectural element. Phase 0 added for laptop prototyping (incl. Starlink data collection). |
| 2026-08-07 | Corrected two overstated hardware claims from earlier in the day: WiCAN Pro is a decided plan, not yet purchased (only the OBDLink MX+ is actually in hand); Victron GX is aspirational, not owned. Decided the Claude Hub's architecture: a standalone service wrapping Claude Code CLI/Claude Agent SDK, exposing a GOMAC-specific toolset (tank levels, automations, battery SOC, etc.) that calls into Home Assistant's API/MQTT — modeled directly on [BojuBot](https://github.com/ScottKirvan/BojuBot), an existing Obsidian plugin built the same way (Claude Code CLI wrapped with a permissioned toolset and vault-native memory). Decided Home Assistant runs as HA Container (Docker) on the 8GB Pi, not Home Assistant OS — HAOS's Supervisor/Add-on model would force the Claude Hub to live inside HA's plugin system instead of alongside it as a peer service; corrected two spots in this doc that still said HAOS. Adopted BojuBot's readonly/standard/full security-mode concept as the intended gating mechanism for anything higher-risk, including CAN-bus writes if ever pursued (no current plans, not ruled out either). Flagged the deployed hub's future need for its own operational memory, separate from this design-time doc, modeled on BojuBot's `_claude-context.md`. Researched and confirmed the OBDLink MX+ (STN1170 chipset) supports raw CAN monitoring (`ATMA`/ISO 11898), not just standard OBD-II PID polling — but has no native Linux SocketCAN interface the way WiCAN Pro does, so using it that way would mean writing a custom bridge. Re-confirmed, more emphatically: WiCAN Pro is **not owned** — flagged whether it's still needed at all, given the overlap, as an open question rather than assuming the earlier plan still holds. Confirmed both compute-hub Raspberry Pis are **Raspberry Pi 5** (8GB and 1GB variants — a genuine, if unusual, 1GB Pi 5 SKU exists, $45, announced Dec 2025; initial assumption that no such variant existed was wrong and got corrected). Flagged that 1GB is tight for a Chromium kiosk dashboard on the display Pi — a lightweight native UI toolkit or stripped-down webview is the likely path, not yet decided. Discussed next steps: installing Home Assistant Container (not HAOS) on the 8GB Pi 5 to get hands-on, including Mosquitto as its own sibling container since Container mode has no add-on store. |
| 2026-08-07 | Started working via Claude Code in this repo. Root `CLAUDE.md` created for repo/tooling guidance, then had `notes/dev/CLAUDE.md`'s domain content merged into it and that file removed. Project renamed: the system is now **GOMAC** (Gomtuu's Automation, Telemetry, & Logistics); "Gomtuu" refers only to the van itself. Dropped Jetson from the compute-hub plan (at least for now); production compute hub is two Raspberry Pis already on hand — 8GB (primary compute) + 1GB (display/UI). This file renamed from `gomtuu-project-overview.md` to `gomac-project-overview.md`; `notes/dev/Gomtuu Specs.md` renamed to `Gomtuu Van Specs.md`; `notes/dev/SmartGomtuu Architecture.canvas` renamed to `GOMAC Architecture.canvas` — all updated for the naming/hardware changes. Also: initial/dev OBD scanner changed to OBDLink MX+ (supersedes the earlier Vgate iCar Pro WiFi plan). Learned Starlink removed GPS from its local API in May 2026 — GPS source is now an open question; prototyping may use a custom Android service for phone GPS until a GPS dongle is acquired. Later the same day, this file was folded entirely into root `CLAUDE.md` and deleted, on the reasoning that `CLAUDE.md` should be the single source of truth — then restored as its own file after Scott pointed out that human contributors and other coding agents won't necessarily read `CLAUDE.md`, so the main project doc needs to stand on its own; `CLAUDE.md` now references this file instead of duplicating it. Still later the same day: found this doc had drifted out of sync with `GOMAC Architecture.canvas` in a few places and fixed them — added Tailscale VPN (remote HA access) and Victron GX (power monitoring via MQTT) as real architecture elements instead of omitting them / leaving them only as an open question; split ESP32-based PIR motion/occupancy sensing (planned) out from vision-based occupancy detection (not currently planned, Jetson-contingent), which the doc had conflated; added the existing bedroom iPad mount to Existing Hardware as a candidate display surface; called out door sensors as their own explicit open question. |
| 2026-08-07 | Renamed the "Claude Hub" component to **GOMAC** throughout — Scott wants to refer to it the same way BojuBot names both the whole plugin and the agent persona, since this repo's primary deliverable *is* that hub; HA/MQTT/ESP32 firmware are supporting infrastructure, not built here. Added a naming note near the top of this doc; docs now say "the GOMAC hub" when the distinction from the project as a whole matters in writing. Worked out a concrete display strategy for the 1GB Pi 5: don't hold a heavy renderer resident continuously — cheap native (LVGL) ambient readout by default, escalate to a kiosk browser (WPE WebKit/Cog, or Chromium as fallback) against HA's own Lovelace dashboard only when GOMAC actually escalates to visual mode, matching the UX model's existing voice/screen split. Considered Godot for the display UI: real appeal (dev ergonomics, fits "own your stack," talks to GOMAC/HA as a peer over MQTT/API) but Raspberry Pi community reports put comfortable Godot 4 use at 8GB recommended/4GB floor for simple 2D — above the 1GB unit's headroom — so set aside for the 1GB display Pi specifically, with the 8GB Pi noted as a viable target if the dev experience is wanted badly enough. Also discussed installing Home Assistant Container (not HAOS) on the 8GB Pi 5 as the concrete next step, including Mosquitto as its own sibling container. |
| 2026-08-07 | Started `notes/dev/gomac-hub-spec.md` — the implementation-level design spec for the GOMAC hub, separate from this product-level overview doc. Confirmed MIT license (already in place at repo root). Defined a new role, **Puka Shell Tour Guide**: lightweight local-exploration/tourist queries (dive bars, alt-culture recommendations, location-aware knowledge questions), explicitly lower-stakes than GOMAC's core reasoning. Motivation for multi-provider AI routing is cost, not capability — reserve Claude usage for mission-critical reasoning, offload Puka Shell queries to a cheaper backend. Verified Gemini CLI (Google, Apache 2.0, open source) as a strong candidate given its built-in Google Search MCP for grounded local results; flagged that Google announced "Antigravity 2.0" at I/O 2026 as a possible consumer replacement, worth watching. Verified and then considered-and-dropped GitHub Copilot CLI as a Puka Shell backend — confirmed its toolset is built specifically for coding/repo tasks, a real mismatch for tourist-guide queries. Left open: the routing mechanism (explicit mode vs. classifier vs. Claude-triages-then-delegates), provider-selectability granularity, whether "what trees am I seeing" implies camera vision or a knowledge query, and the hub's own implementation language/runtime (no constraint forcing TypeScript the way BojuBot's Obsidian-plugin host does). |
| 2026-08-07 | Confirmed the tree-ID example is a location/season knowledge question, not camera vision — closed that open item. Added **Ollama** as a third Puka Shell candidate: verified it now has native web-search and tool-calling capability, so it's not the capability gap it might once have been, and it's the only candidate that works fully offline, which is a genuinely distinct value proposition (matches GOMAC's own graceful-degradation-with-no-cloud principle) beyond just saving tokens. Flagged a real, numbers-backed hardware conflict though: reliable tool-calling currently wants ~6-8GB RAM, which is the entire 8GB compute Pi, competing directly with HA/Mosquitto/Whisper/GOMAC already slated for that box — noted this likely needs a RAM upgrade (e.g. 16GB Pi 5) or a separate dedicated machine, not a drop-in addition. Left whether smaller (1B-3B) models are reliable enough at tool-calling to avoid that entirely as an open, untested question. |

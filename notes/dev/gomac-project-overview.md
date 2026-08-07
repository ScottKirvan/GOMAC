# GOMAC — Gomtuu's Automation, Telemetry, & Logistics

> *"A living ship... it needs a companion as much as Tam needs Gomtuu."*
> — Star Trek TNG, "Tin Man"

This is the main project doc for GOMAC — written for human contributors and any coding agent working in this repo, not just Claude Code (see the root [`CLAUDE.md`](../../CLAUDE.md) for repo/tooling guidance specific to that tool). Update this file's relevant sections as decisions are made and the design evolves.

## Overview

**Gomtuu** is a 2005 Mercedes T1N Sprinter built as a full-time live-aboard, off-grid, enterprise-grade remote office. **GOMAC** is the intelligent, voice-first vehicle automation and trip planning system built for her. This is infrastructure, not a weekend toy.

**Design priority: reliable first, clever second.**

The project is intended to be **open source** and configurable for other overlanders and future vehicles. A vehicle config layer abstracts hardware specifics so the same software stack runs on different rigs.

**No purchases or commitments have been made yet.** All architecture and hardware choices are still in design/spec phase.

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
| Compute hub (progression) | Laptop (prototyping) → 2× Raspberry Pi (production) | Runs HA, MQTT, Whisper, Claude integration, display/UI — see "Compute Hub" below |
| Automation backbone | Home Assistant | Device integration, dashboards, automations |
| Message bus | MQTT (Mosquitto) | All inter-device communication |
| Intelligence layer | Claude API | Reasoning, planning, NL understanding |
| Voice pipeline | Whisper → Claude → TTS | Voice-first interaction |
| Remote access | Tailscale VPN | Secure remote access to Home Assistant without port forwarding |
| Public-facing site | Cloud-hosted web app | Live travel stats, location, journal — outbound only |

**Compute Hub**: production hardware is **two Raspberry Pis already on hand** (exact models/generations not yet finalized in these docs — TBD):
- **8GB Pi** — primary compute: Home Assistant OS, Mosquitto, Whisper, Claude integration
- **1GB Pi** — dedicated display/UI node

No Jetson is currently planned. (Previously the plan was Laptop → RPi → Jetson; the Jetson step is dropped, at least for now — see Open Questions for the vision/local-LLM capabilities that were contingent on it.)

**Power monitoring**: a Victron GX device monitors the power system (battery SOC, solar input, load, charger state) and publishes it to MQTT. Whether that's standalone Cerbo GX hardware or VenusOS running on the 8GB Pi is still open — see Open Questions.

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
- Claude API integration prototype (tool use patterns)
- Define MQTT topic structure
- Define vehicle config file schema

**Phase 1 — The Nervous System** *(physical install on dedicated hardware)*
- **Compute hub: 8GB Raspberry Pi** — runs HAOS, Mosquitto, Claude integration
- **1GB Raspberry Pi** — dedicated display/UI node
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
- Victron GX monitoring — Cerbo GX hardware vs. VenusOS on the 8GB Pi undecided (see Open Questions); feeds battery SOC, solar input, load, and charger state to MQTT

**Controllable Loads**
- Dimmable lighting: overheads, under-cabinet, bee lights in bedroom
- Independently powered puck lighting: garage, closet, above sink
- Waeco RSD-110 refrigerator/freezer (12V, 4A rated)
- 12V 10,000 BTU CountryModPro rooftop AC
- Diesel heater
- Water pump (pressure-based electric, on cutoff switch)
- Switch panel (partial: skynet + diesel heater done)

**Compute**
- 8GB Raspberry Pi (production compute hub — model/generation TBD)
- 1GB Raspberry Pi (production display/UI node — model/generation TBD)

**Connectivity / Data**
- Starlink (wired, installed) — bandwidth-heavy tasks; **no longer a GPS source** — Starlink removed GPS from its local API in May 2026
- Multi-carrier cell (TBD) — low-latency API calls; fallback hierarchy TBD
- Pioneer DMH-WT3800NEX2561 head unit (CarPlay, Android Auto; backup cam not installed)
- Autel Bluetooth OBD-II scanner (deep diagnostics, T1N proprietary codes — keep)
- **OBDLink MX+** (decided) — initial/dev OBD scanner, supersedes earlier Vgate iCar Pro WiFi plan
- **WiCAN Pro** (decided) — WiFi, native MQTT, raw CAN via SocketCAN, built-in HA integration; always-on data feed to MQTT broker
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

## Open Questions

**Architecture**
- [x] Compute hub decided: Laptop (Phase 0) → 2x Raspberry Pi, 8GB (compute) + 1GB (display/UI) (Phase 1)
- [ ] Exact Raspberry Pi models/generations for the 8GB and 1GB units
- [ ] Victron GX monitoring is planned (battery SOC, solar input, load, charger state → MQTT) — still open whether it's standalone Cerbo GX hardware or VenusOS running on the 8GB Pi
- [ ] Vision/occupancy detection, local-LLM offline fallback — not currently planned; would require a vision/AI-capable compute node (e.g. a Jetson) added later. No commitment either way yet.
- [ ] Connectivity fallback hierarchy — auto-switching Starlink/cell logic
- [ ] GPS sourcing: Starlink no longer exposes GPS via its local API (removed May 2026). Prototyping option: a custom Android service reporting phone GPS. Production plan: a dedicated GPS dongle (model TBD, not yet acquired).

**Public Travel Site**
- [ ] Hosting / stack — Next.js + Vercel + Supabase? Static + edge functions? Self-hosted?
- [ ] Push mechanism — HA HTTP integration? Custom MQTT-to-cloud bridge? Direct webhook?
- [ ] Data subset and sanitization rules (no PII, location precision/delay for safety)
- [ ] Domain / branding
- [ ] Update cadence — true real-time vs every N minutes

**Hardware / Sensors**
- [ ] Water tank level sensing method (float, capacitive, ultrasonic?)
- [x] OBD integration: WiCAN Pro (WiFi, native MQTT, raw CAN) for continuous monitoring; Autel kept for deep diagnostics
- [x] Initial/dev OBD scanner: OBDLink MX+ — supersedes the earlier Vgate iCar Pro WiFi plan, for prototyping until WiCAN Pro arrives
- [x] CAN bus access: WiCAN Pro exposes raw CAN via SocketCAN — T1N bus can be decoded over time with SavvyCAN + DBC files
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
- [ ] Claude API integration pattern (tool use? structured outputs?)

## Session Log

| Date | Notes |
|---|---|
| 2026-05-15 | Session "SmartGomtuu" started. `notes/dev/CLAUDE.md` created. Reviewed all existing files. No purchases committed. Still in design/spec phase. |
| 2026-05-31 | OBD adapter decisions: WiCAN Pro (production) + Vgate iCar Pro WiFi (ordered, dev). Compute hub revised to laptop→RPi 5→Jetson progression to defer Jetson cost. Added Public Travel Site as architectural element. Phase 0 added for laptop prototyping (incl. Starlink data collection). |
| 2026-08-07 | Started working via Claude Code in this repo. Root `CLAUDE.md` created for repo/tooling guidance, then had `notes/dev/CLAUDE.md`'s domain content merged into it and that file removed. Project renamed: the system is now **GOMAC** (Gomtuu's Automation, Telemetry, & Logistics); "Gomtuu" refers only to the van itself. Dropped Jetson from the compute-hub plan (at least for now); production compute hub is two Raspberry Pis already on hand — 8GB (primary compute) + 1GB (display/UI). This file renamed from `gomtuu-project-overview.md` to `gomac-project-overview.md`; `notes/dev/Gomtuu Specs.md` renamed to `Gomtuu Van Specs.md`; `notes/dev/SmartGomtuu Architecture.canvas` renamed to `GOMAC Architecture.canvas` — all updated for the naming/hardware changes. Also: initial/dev OBD scanner changed to OBDLink MX+ (supersedes the earlier Vgate iCar Pro WiFi plan). Learned Starlink removed GPS from its local API in May 2026 — GPS source is now an open question; prototyping may use a custom Android service for phone GPS until a GPS dongle is acquired. Later the same day, this file was folded entirely into root `CLAUDE.md` and deleted, on the reasoning that `CLAUDE.md` should be the single source of truth — then restored as its own file after Scott pointed out that human contributors and other coding agents won't necessarily read `CLAUDE.md`, so the main project doc needs to stand on its own; `CLAUDE.md` now references this file instead of duplicating it. Still later the same day: found this doc had drifted out of sync with `GOMAC Architecture.canvas` in a few places and fixed them — added Tailscale VPN (remote HA access) and Victron GX (power monitoring via MQTT) as real architecture elements instead of omitting them / leaving them only as an open question; split ESP32-based PIR motion/occupancy sensing (planned) out from vision-based occupancy detection (not currently planned, Jetson-contingent), which the doc had conflated; added the existing bedroom iPad mount to Existing Hardware as a candidate display surface; called out door sensors as their own explicit open question. |

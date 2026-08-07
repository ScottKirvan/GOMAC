# CLAUDE.md — SmartGomtuu Project

This file provides persistent context for Claude Code (ObsidiBot) when working on the SmartGomtuu project. Update it as decisions are made and the design evolves.

## Project Overview

**SmartGomtuu** is an intelligent, voice-first vehicle automation and trip planning platform built on a 2005 Mercedes T1N Sprinter — used as a full-time live-aboard, off-grid, enterprise-grade remote office.

**Design priority: reliable first, clever second.**

The project is intended to be **open source** and configurable for other overlanders and future vehicles. A vehicle config layer abstracts hardware specifics so the same software stack runs on different rigs.

Scott is an engineer and programmer — homebrew is the preference over commercial black boxes.

**No purchases or commitments have been made yet.** All architecture and hardware choices are still in design/spec phase.

The canonical project overview document is `[[gomtuu-project-overview]]`.

---

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
│  sensors/control │  laptop → RPi → Jetson│
└──────────────────┴──────────────────────┘
```

| Layer | Technology | Role |
|---|---|---|
| Edge sensors/control | ESP32 (mesh) | Tanks, environment, lighting, locks, etc. |
| Compute hub (progression) | Laptop → RPi 5 → Jetson (future) | Runs HA, MQTT, Whisper, Claude integration |
| Automation backbone | Home Assistant | Device integration, dashboards, automations |
| Message bus | MQTT (Mosquitto) | All inter-device communication |
| Intelligence layer | Claude API | Reasoning, planning, NL understanding |
| Voice pipeline | Whisper → Claude → TTS | Voice-first interaction |
| Public-facing site | Cloud-hosted web app | Live travel stats, location, journal — outbound only |

---

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

---

## Core Feature Areas

### 1. Resource Management
- **Water**: track fill events, consumption rate, current level; model days remaining; dump station routing
- **Grey water**: fill rate correlated to fresh usage; proactive alerts with nearby dump stations
- **Power**: battery SOC, solar in, loads; reason about "can we run AC tonight without killing the battery?"
- **Inventory** (future): consumables tracking, resupply planning

### 2. Trip Intelligence
The primary unsolved problem — multi-variable route planning currently requires 4-5 separate tools.

Example queries the system must handle:
- *"Is there any boondocking between here and Minneapolis we should check out?"*
- *"Find a route from Minneapolis to West Virginia where we can take our time and stay under 85°F for the next 3 weeks"*
- *"We have 40% battery, 200 miles to the next hookup, and it'll be 95° tonight — what do we prioritize?"*

Variables in play: route options, weather (temp/precip) along route, campsite availability and quality, tank levels, drive vs. explore time, budget, vehicle limitations (T1N height/weight/road type).

### 3. Predictive Maintenance (T1N-specific)
OBD data → Home Assistant → Claude reasons about trends, not just thresholds.

Known T1N failure points to monitor:
- Dual-mass flywheel (vibration, mileage)
- Glow plugs (cold start behavior, error codes)
- Fuel system (filter interval, lift pump)
- EGR / turbo (intake temps, boost pressure)
- Coolant system (temp trends, overflow level)

### 4. Ambient Awareness & Automation
- Occupancy and presence detection (Jetson vision — future)
- Geofencing triggers (pre-cool van before arrival)
- Lighting scenes (arrival, bedtime, movie mode, etc.)
- Load shedding based on battery SOC
- Door/lock state monitoring

### 5. Public Travel Site
A cloud-hosted, public-facing site that follows Scott & Wendy's travels in real (or near-real) time.

- **Live location** on a map (from Starlink GPS)
- **System stats dashboard** — battery SOC, solar input, interior temp, water levels
- **Journal / blog** entries
- **Trip history** — past routes, places visited
- **Push pattern only** — van pushes data outbound to a cloud endpoint; nothing inbound to the van for security
- Hosted separately from in-van systems; subset of MQTT data, sanitized for public consumption
- Stack TBD (likely Next.js or similar + a cloud DB/store)

---

## Data Inputs

### Real-time (ESP32 sensors)
- Tank levels: fresh water, grey water
- Power: battery SOC, solar input, loads
- Environment: interior/exterior temp, humidity
- Vehicle: engine data (OBD), door/lock state
- Location: GPS

### Vision (Jetson)
- Occupancy and presence detection
- Security monitoring
- Gesture input (TBD)

### Human
- Voice queries
- Geofencing / presence
- Manual overrides

### External / Web
- Weather forecasts (route-aware, multi-day)
- Campsite availability (Campendium, iOverlander, Freecampsites)
- Points of interest (tourism, breweries, services, dump stations)
- Traffic and road conditions
- Starlink/cell coverage maps

---

## Build Phases

### Phase 0 — Laptop Prototyping *(now — no van hardware needed)*
- Home Assistant in Docker on laptop
- Mosquitto MQTT broker locally
- `python-obd` → Vgate iCar Pro WiFi (when it arrives)
- Starlink local API integration → collect & visualize dish stats, GPS, signal quality
- Claude API integration prototype (tool use patterns)
- Define MQTT topic structure
- Define vehicle config file schema

### Phase 1 — The Nervous System *(physical install on dedicated hardware)*
- **Compute hub: Raspberry Pi 5 (4GB)** — runs HAOS, Mosquitto, Claude integration
  - ~4-8W power draw, <1A @ 12V
- ESP32 mesh network
- WiCAN Pro for OBD (when it arrives)
- Sensors: tanks, power, environment
- Starlink GPS feeding HA
- Basic automations and dashboard working
- **Public travel site v1** — push location + basic stats to cloud, public read-only view

### Phase 2 — The Brain *(software, requires Phase 1)*
- Voice pipeline: Whisper (local STT, RPi `base` or `small` model) → Claude → TTS
- Wake word integration
- Simple voice queries against local data
- Travel site v2 — richer dashboards, journal, trip history

### Phase 3 — Trip Intelligence *(mostly software, can prototype in parallel)*
- External data integrations (weather, campsites, POI)
- Multi-variable route planning
- Resource forecasting across multi-day plans
- Predictive maintenance reasoning

### Phase 4 — Jetson Upgrade *(future, when budget allows)*
- Swap RPi for Jetson (Orin Nano or similar)
- Fast local Whisper, vision/occupancy detection
- Local LLM fallback for offline operation
- Software stack stays the same — drop-in replacement

---

## Existing Hardware (Relevant to Automation)

### Power System
- 2x Battle Born BB10012 — 100Ah 12V LiFePO4 (200Ah total)
- Victron MPPT 100/15 solar charge controller
- 2x 220W bifacial solar panels
- Victron 12/375 pure sine wave inverter
- Victron 12/15 Blue Smart battery charger (shore power)
- Victron Orion Smart HQ2025HGAZQ DC/DC charger (alternator)
- Shore power inlet (installed)
- Coulombmeter (mounted)

### Controllable Loads
- Dimmable lighting: overheads, under-cabinet, bee lights in bedroom
- Independently powered puck lighting: garage, closet, above sink
- Waeco RSD-110 refrigerator/freezer (12V, 4A rated)
- 12V 10,000 BTU CountryModPro rooftop AC
- Diesel heater
- Water pump (pressure-based electric, on cutoff switch)
- Switch panel (partial: skynet + diesel heater done)

### Connectivity / Data
- Starlink (wired, installed) — bandwidth-heavy tasks
- Multi-carrier cell (TBD) — low-latency API calls; fallback hierarchy TBD
- Pioneer DMH-WT3800NEX2561 head unit (CarPlay, Android Auto; backup cam not installed)
- Autel Bluetooth OBD-II scanner (deep diagnostics, T1N proprietary codes — keep)
- **WiCAN Pro** (decided) — WiFi, native MQTT, raw CAN via SocketCAN, built-in HA integration; always-on data feed to MQTT broker
- USB-A and USB-C outlets in cab, bedroom, galley

### Water System
- 5 gal fresh tank + 10 gal fresh spare
- 5 gal grey tank
- Folding covered sink with pressure-based electric pump

---

## Technical Constraints

- **12V nominal**: 10.5V (dead LiFePO4) to 14.6V (charging)
- All nodes must tolerate automotive voltage fluctuations
- Reverse polarity protection required on all nodes
- Inductive loads (fans, pumps) need flyback diodes
- PWM dimming: >200Hz minimum, 1–20kHz preferred
- Wire gauge: follow automotive standards
- Space and thermal constraints inside a van
- Core functions must degrade gracefully when offline (no cloud)

---

## Open Questions

### Architecture
- [x] Compute hub progression decided: Laptop (Phase 0) → RPi 5 (Phase 1) → Jetson (future)
- [ ] RPi 5 4GB vs 8GB — Whisper headroom consideration
- [ ] Victron Cerbo GX vs. VenusOS on RPi — separate device needed?
- [ ] Offline Claude fallback — local LLM on future Jetson for core functions when no connectivity?
- [ ] Connectivity fallback hierarchy — auto-switching Starlink/cell logic

### Public Travel Site
- [ ] Hosting / stack — Next.js + Vercel + Supabase? Static + edge functions? Self-hosted?
- [ ] Push mechanism — HA HTTP integration? Custom MQTT-to-cloud bridge? Direct webhook?
- [ ] Data subset and sanitization rules (no PII, location precision/delay for safety)
- [ ] Domain / branding
- [ ] Update cadence — true real-time vs every N minutes

### Hardware / Sensors
- [ ] Water tank level sensing method (float, capacitive, ultrasonic?)
- [x] OBD integration: WiCAN Pro (WiFi, native MQTT, raw CAN) for continuous monitoring; Autel kept for deep diagnostics
- [x] Dev OBD adapter: Vgate iCar Pro WiFi (ordered) — ELM327/WiFi, for prototyping until WiCAN Pro arrives
- [x] CAN bus access: WiCAN Pro exposes raw CAN via SocketCAN — T1N bus can be decoded over time with SavvyCAN + DBC files
- [ ] Primary screen size/location for visual resolution mode
- [ ] ESP32 node count and placement (zone-by-zone mapping TBD)

### Voice / UX
- [ ] Wake word — custom or off-the-shelf (e.g., openWakeWord)?
- [ ] TTS engine selection (Piper, Coqui, ElevenLabs?)
- [ ] Whisper model size vs. Jetson headroom tradeoff

### Software / Open Source
- [ ] Repo structure and licensing
- [ ] Vehicle config file schema design
- [ ] Claude API integration pattern (tool use? structured outputs?)

---

## Files in This Folder

| File | Contents |
|---|---|
| `gomtuu-project-overview.md` | Canonical project overview — goals, architecture, features, build phases |
| `Gomtuu Specs.md` | Full van hardware spec and build task list |
| `rv-automation-research.md` | Prior research: state of the art, architecture options |
| `esp32.md` | ESP32 vs Teensy 4.1 comparison transcript |
| `CLAUDE.md` | This file — persistent project context for Claude |

---

## Session Log

| Date | Notes |
|---|---|
| 2026-05-15 | Session "SmartGomtuu" started. CLAUDE.md created. Reviewed all existing files. No purchases committed. Still in design/spec phase. |
| 2026-05-31 | OBD adapter decisions: WiCAN Pro (production) + Vgate iCar Pro WiFi (ordered, dev). Compute hub revised to laptop→RPi 5→Jetson progression to defer Jetson cost. Added Public Travel Site as architectural element. Phase 0 added for laptop prototyping (incl. Starlink data collection). |

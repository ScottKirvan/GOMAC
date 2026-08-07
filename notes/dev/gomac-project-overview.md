# GOMAC — Gomtuu's Automation, Telemetry, & Logistics

> *"A living ship... it needs a companion as much as Tam needs Gomtuu."*
> — Star Trek TNG, "Tin Man"

## Overview

**Gomtuu** is a 2005 Mercedes T1N Sprinter built as a full-time live-aboard, off-grid, enterprise-grade remote office. **GOMAC** is the intelligent, voice-first vehicle automation and trip planning system built for her. The project is open-source and designed to be configurable for other overlanders and future vehicles.

This is infrastructure, not a weekend toy. Design priority: reliable first, clever second.

---

## Platform

- **Vehicle**: 2005 Mercedes-Benz Sprinter T1N
- **Use**: Full-time live-aboard, continuous upgrades (it's always a WIP)
- **Power**: Off-grid with redundant solutions
- **Connectivity**: Starlink + multi-carrier cell (redundant, fallback hierarchy TBD)
  - Cell preferred for low-latency API calls; Starlink for bandwidth-heavy tasks
  - Core functions must degrade gracefully when offline

---

## Goals

1. **Intelligent ambient awareness** — the van knows its state and anticipates needs
2. **Voice-first interaction** for quick/ambient queries
3. **Screen-based resolution** for complex tasks (trip planning, comparisons, options)
4. **Multi-variable trip planning** — the primary unsolved problem this replaces manual tool-wrangling for
5. **Resource management** — water, grey water, power, inventory
6. **Predictive maintenance** — especially for known T1N failure points
7. **Open source and configurable** — a vehicle config layer abstracts hardware specifics so others can run the same stack on their own rigs

---

## Architecture

```
┌─────────────────────────────────────────┐
│           Claude (intelligence)          │
│   planning · decisions · NL interface   │
├─────────────────────────────────────────┤
│       Home Assistant (automation)        │
│    devices · sensors · rules · UI       │
├─────────────────────────────────────────┤
│            MQTT (message bus)            │
│        everything talks here            │
├──────────────────┬──────────────────────┤
│   ESP32 nodes    │   Compute Hub         │
│  sensors/control │  2× Raspberry Pi      │
└──────────────────┴──────────────────────┘
```

### Key Components

| Layer | Technology | Role |
|-------|-----------|------|
| Edge sensors/control | ESP32 (mesh) | Tanks, environment, lighting, locks, etc. |
| Compute hub | 2× Raspberry Pi (8GB + 1GB) | 8GB: Home Assistant, MQTT, local STT (Whisper), Claude integration. 1GB: display/UI. No Jetson currently planned. |
| Automation backbone | Home Assistant | Device integration, dashboards, automations |
| Message bus | MQTT | All inter-device communication |
| Intelligence layer | Claude API | Reasoning, planning, NL understanding |
| Voice pipeline | Whisper → Claude → TTS | Voice-first interaction |

---

## UX Model: Voice-First with Modal Escalation

The interaction model has two modes that transition naturally:

### Ambient / Quick queries → Voice in, voice out
- "Claude, what's interesting around here?"
- "Is there a brewery nearby?"
- "How's our water situation?"
- "What's the weather doing tonight?"

### Complex / Planning → Voice triggers, screen resolves
- Multi-variable trip planning
- Route options with comparisons
- Resource planning across multiple days
- Anything requiring a map, timeline, or table

The system should know which mode to use — simple queries get immediate voice responses, complex ones say "let me pull that up" and surface a visual.

---

## Data Inputs

### Real-time Sensors (ESP32)
- Tank levels: fresh water, grey water (fill/consume/dump lifecycle)
- Power: battery state of charge, solar input, load
- Environment: interior/exterior temperature, humidity
- Vehicle: engine data (OBD), door/lock state
- Location: GPS (source TBD — Starlink removed GPS from its local API in May 2026; see root `CLAUDE.md` Open Questions)

### Human Inputs
- Voice queries
- Geofencing (presence detection, arrival/departure triggers)
- Real-time presence (occupancy)

### Camera / Vision (not currently planned)
- Occupancy and presence detection
- Security monitoring
- Gesture input (TBD)
- Would require a vision-capable compute node (e.g. a Jetson) added later — no commitment made either way yet

### Web / External Data
- Weather forecasts (route-aware, multi-day)
- Campsite availability (Campendium, iOverlander, Freecampsites, etc.)
- Points of interest (tourism, breweries, services, dump stations)
- Traffic and road conditions
- Starlink/cell signal coverage maps

---

## Resource Management

### Water System
- Track: fill events, consumption rate, current level
- Model: usage × occupants × days remaining
- Integrate: dump station locations along planned route
- Alert: proactive "you'll need a fill in ~2 days at current rate"

### Grey Water
- Track: fill rate (correlated with fresh water usage)
- Alert: capacity warnings with nearest dump stations
- Proactive: "grey is at 70%, rain moving in tonight, dump station 12 miles — worth going now?"

### Power
- Track: battery SOC, solar input, loads
- Model: consumption rate vs. generation vs. planned usage
- Integrate: shore power hookup locations if needed
- Reason: "can we run the AC tonight without killing the battery?"

### Inventory (future)
- Consumables tracking
- Resupply planning integrated with route

---

## Trip Intelligence

This is the core unsolved problem — multi-variable trip planning currently requires wrangling 4-5 separate tools manually.

### Example queries the system should handle:
- *"Is there any boondocking between here and Minneapolis we should check out?"*
- *"Find a route from Minneapolis to West Virginia where we can take our time and stay under 85°F for the next 3 weeks"*
- *"We have 40% battery, 200 miles to the next hookup, and it'll be 95° tonight — what do we prioritize?"*

### Variables in play:
- Route options and waypoints
- Weather forecasts (temperature, precipitation) along route
- Campsite availability and quality (cell signal, shade, hookups)
- Tank levels and resupply points
- Drive time vs. exploration time preferences
- Budget
- Vehicle limitations (T1N: height, weight, road type)

---

## Predictive Maintenance (T1N-specific)

The T1N is reliable but has known failure points worth monitoring:

- **Dual-mass flywheel** — track vibration anomalies, mileage
- **Glow plugs** — cold start behavior, error codes
- **Fuel system** — fuel filter interval, lift pump
- **EGR / turbo** — intake temperatures, boost pressure
- **Coolant system** — temperature trends, overflow level

Integrate OBD data → Home Assistant → Claude reasons about trends, not just thresholds.

*"Your coolant temp has been running 8° higher than baseline for the last 3 days — worth checking the thermostat before the mountain stretch."*

---

## Multi-Platform Design

The system is designed so other overlanders can run it on their own vehicles. Key abstraction:

**Vehicle config file** — defines:
- Tank capacities and sensor mappings
- Electrical topology
- ESP32 node assignments
- Vehicle-specific maintenance schedules and known issues

The intelligence layer reads config, not hardcoded assumptions. A 4Runner build and a Sprinter build run the same software with different configs.

---

## Build Phases

### Phase 1 — The Nervous System
*Physical installation, can't skip*
- ESP32 mesh network
- MQTT broker
- Home Assistant on the 8GB Raspberry Pi; display/UI on the 1GB Raspberry Pi
- Sensors: tanks, power, environment, GPS
- Basic automations and dashboard working

### Phase 2 — The Brain
*Software, requires Phase 1*
- Voice pipeline: Whisper (local STT) → Claude → TTS
- Claude integration layer
- Simple queries against local data
- "What's our water level?" "What's the temperature outside?"

### Phase 3 — Trip Intelligence
*Mostly software, can prototype on laptop in parallel*
- External data integrations (weather, campsites, POI)
- Multi-variable route planning
- Resource forecasting across multi-day plans
- Predictive maintenance reasoning

---

## Open Questions

- [ ] Offline fallback strategy for Claude API — local LLM fallback not currently planned (would need a more capable compute node than the current 2× Pi setup)
- [ ] Voice wake word — custom or off-the-shelf?
- [ ] Primary screen size/location for visual resolution mode (on the 1GB Pi)
- [ ] OBD integration approach: WiCAN Pro decided (see `notes/dev/Gomtuu Van Specs.md` / root `CLAUDE.md` for details)
- [ ] Connectivity fallback hierarchy — auto-switching Starlink/cell logic
- [ ] GPS sourcing: Starlink no longer exposes GPS via its local API (removed May 2026) — see root `CLAUDE.md` Open Questions for the Android-service/GPS-dongle options being considered
- [ ] Repo structure and licensing for open-source release

---

## References & Prior Art

- [Home Assistant](https://www.home-assistant.io/)
- [ESPHome](https://esphome.io/) — ESP32 firmware that speaks Home Assistant natively
- [Mosquitto](https://mosquitto.org/) — MQTT broker
- [Whisper](https://github.com/openai/whisper) — local speech-to-text
- [iOverlander](https://www.ioverlander.com/), [Campendium](https://www.campendium.com/), [Freecampsites](https://freecampsites.net/)

---

*Document started: 2026-03-28*
*Based on initial design conversation — living document, expect heavy revision*

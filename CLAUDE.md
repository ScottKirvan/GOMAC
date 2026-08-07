# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Operating rules (hard requirements)

1. **Never commit or push to `main` without explicit, in-the-moment instruction to do so.** Always develop on a feature branch and open a PR for Scott to review. This holds even for small doc edits.
2. **Branch names must be meaningful and descriptive of the work** (e.g. `docs/add-root-claude-md`), never a generic/auto-generated name like `claude/initial-setup-4vzll0`. If a session starts on a pre-assigned generic branch name, rename it (`git branch -m`) before pushing/opening a PR.
3. **Don't use the multiple-choice question tool to ask Scott things.** If something is ambiguous, ask in plain conversational language instead.
4. **No Claude/AI attribution anywhere pushed to this repo** — not in commit messages (no `Co-Authored-By`, no session links), not in PR titles/bodies, not in PR/issue comments, not in code comments. This is a professional project; contributors don't put bylines on commits, issues, or PRs, and that includes AI-authored ones. Default GitHub-integration behavior may try to append an attribution footer to PR/issue posts — strip it before submitting, and verify by re-reading what was actually posted (via the API), not from memory.
5. **Scott merges PRs himself using "rebase and merge"** (to keep release-please's changelog generation working correctly) and deletes the branch afterward. Don't assume a PR is still open without checking — sync `main` and prune local branches before starting new work.

## Working with Scott

Scott is a senior software engineer and systems architect. He works from first principles and prefers rolling his own systems and doing the extra work to use existing hardware over taking shortcuts or working around the limitations of off-the-shelf libraries/packages — homebrew over commercial black boxes.

- **Don't bake in assumptions that make a task easier without checking with him first.** Surface the tradeoff and let him decide, even if it slows things down.
- **Nothing is deferred without his explicit permission.** Don't quietly punt on a hard part of the spec or implementation.
- **When a sub-agent takes a shortcut, or declares something "not a bug" without actually having implemented or verified it, call that out explicitly** rather than passing it through as if it were solid.

## Repo state

This repo was generated from [ScottKirvan/ScooterGitTemplate](https://github.com/ScottKirvan/ScooterGitTemplate) and has **not yet been customized** — `README.md` and `docs/index.md` still contain template placeholder/lorem-ipsum text (see the "Customization Checklist" in `README.md`). Don't treat that placeholder copy as real project content.

The actual substance of this project lives in **`notes/dev/`**, which documents **GOMAC** (Gomtuu's Automation, Telemetry, & Logistics): an intelligent, voice-first vehicle automation and trip-planning platform.

**Naming: GOMAC is the system, Gomtuu is the van.** Gomtuu is Scott's 2005 Mercedes T1N Sprinter (full-time live-aboard, off-grid) — named after the living ship in the Star Trek TNG episode "Tin Man." GOMAC is the automation/intelligence platform being built for her. Don't conflate the two in docs: hardware that belongs to the physical vehicle is "Gomtuu's," the software/systems platform is "GOMAC."

It's currently in the **design/spec phase — no application code has been written yet, and no hardware purchases beyond what's listed as existing have been committed to.**

This file is now the single source of truth for GOMAC's domain context (architecture, build phases, open questions, session log) as well as repo/tooling guidance — Scott previously kept a separate `notes/dev/CLAUDE.md` for domain context (for a different, Obsidian-vault-scoped tool) but has moved to working out of this repo via Claude Code exclusively, so that file was merged in here and removed to avoid two diverging sources of truth. Update this file's relevant sections as decisions are made and the design evolves, the same way `notes/dev/CLAUDE.md` used to be updated.

---

## GOMAC — Project Overview

**GOMAC** is an intelligent, voice-first vehicle automation and trip planning platform built on Gomtuu, Scott's 2005 Mercedes T1N Sprinter — used as a full-time live-aboard, off-grid, enterprise-grade remote office.

**Design priority: reliable first, clever second.**

The project is intended to be **open source** and configurable for other overlanders and future vehicles. A vehicle config layer abstracts hardware specifics so the same software stack runs on different rigs.

**No purchases or commitments have been made yet.** All architecture and hardware choices are still in design/spec phase.

The canonical project overview document is `notes/dev/gomac-project-overview.md`. (Note: that file and this section currently overlap in content — not yet reconciled into a single non-duplicated source; flagged as an open item below.)

### System Architecture

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
| Edge sensors/control | ESP32 (mesh) | Tanks, environment, lighting, locks, etc. |
| Compute hub (progression) | Laptop (prototyping) → 2× Raspberry Pi (production) | Runs HA, MQTT, Whisper, Claude integration, display/UI — see "Compute Hub" below |
| Automation backbone | Home Assistant | Device integration, dashboards, automations |
| Message bus | MQTT (Mosquitto) | All inter-device communication |
| Intelligence layer | Claude API | Reasoning, planning, NL understanding |
| Voice pipeline | Whisper → Claude → TTS | Voice-first interaction |
| Public-facing site | Cloud-hosted web app | Live travel stats, location, journal — outbound only |

**Compute Hub**: production hardware is **two Raspberry Pis already on hand** (exact models/generations not yet finalized in these docs — TBD):
- **8GB Pi** — primary compute: Home Assistant OS, Mosquitto, Whisper, Claude integration
- **1GB Pi** — dedicated display/UI node

No Jetson is currently planned. (Previously the plan was Laptop → RPi → Jetson; the Jetson step is dropped, at least for now — see Open Questions for the vision/local-LLM capabilities that were contingent on it.)

### UX Model: Voice-First with Modal Escalation

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

### Core Feature Areas

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

**4. Ambient Awareness & Automation**
- Geofencing triggers (pre-cool van before arrival)
- Lighting scenes (arrival, bedtime, movie mode, etc.)
- Load shedding based on battery SOC
- Door/lock state monitoring
- Occupancy/presence detection and vision-based features: not currently planned (would need a vision-capable compute node, e.g. a Jetson, later) — see Open Questions

**5. Public Travel Site**
A cloud-hosted, public-facing site that follows Scott & Wendy's travels in real (or near-real) time.

- **Live location** on a map (GPS source TBD — Starlink no longer exposes GPS via its local API as of May 2026; see Open Questions)
- **System stats dashboard** — battery SOC, solar input, interior temp, water levels
- **Journal / blog** entries
- **Trip history** — past routes, places visited
- **Push pattern only** — van pushes data outbound to a cloud endpoint; nothing inbound to the van for security
- Hosted separately from in-van systems; subset of MQTT data, sanitized for public consumption
- Stack TBD (likely Next.js or similar + a cloud DB/store)

### Data Inputs

**Real-time (ESP32 sensors)**
- Tank levels: fresh water, grey water
- Power: battery SOC, solar input, loads
- Environment: interior/exterior temp, humidity
- Vehicle: engine data (OBD), door/lock state
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

### Build Phases

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

### Existing Hardware (Relevant to Automation)

**Power System**
- 2x Battle Born BB10012 — 100Ah 12V LiFePO4 (200Ah total)
- Victron MPPT 100/15 solar charge controller
- 2x 220W bifacial solar panels
- Victron 12/375 pure sine wave inverter
- Victron 12/15 Blue Smart battery charger (shore power)
- Victron Orion Smart HQ2025HGAZQ DC/DC charger (alternator)
- Shore power inlet (installed)
- Coulombmeter (mounted)

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
- USB-A and USB-C outlets in cab, bedroom, galley

**Water System**
- 5 gal fresh tank + 10 gal fresh spare
- 5 gal grey tank
- Folding covered sink with pressure-based electric pump

### Technical Constraints

- **12V nominal**: 10.5V (dead LiFePO4) to 14.6V (charging)
- All nodes must tolerate automotive voltage fluctuations
- Reverse polarity protection required on all nodes
- Inductive loads (fans, pumps) need flyback diodes
- PWM dimming: >200Hz minimum, 1–20kHz preferred
- Wire gauge: follow automotive standards
- Space and thermal constraints inside a van
- Core functions must degrade gracefully when offline (no cloud)

### Open Questions

**Architecture**
- [x] Compute hub decided: Laptop (Phase 0) → 2x Raspberry Pi, 8GB (compute) + 1GB (display/UI) (Phase 1)
- [ ] Exact Raspberry Pi models/generations for the 8GB and 1GB units
- [ ] Victron Cerbo GX vs. VenusOS on the 8GB Pi — separate device needed?
- [ ] Vision/occupancy detection, local-LLM offline fallback — not currently planned; would require a vision/AI-capable compute node (e.g. a Jetson) added later. No commitment either way yet.
- [ ] Connectivity fallback hierarchy — auto-switching Starlink/cell logic
- [ ] GPS sourcing: Starlink no longer exposes GPS via its local API (removed May 2026). Prototyping option: a custom Android service reporting phone GPS. Production plan: a dedicated GPS dongle (model TBD, not yet acquired).
- [ ] Reconcile the duplication between this file's "GOMAC — Project Overview" section and `notes/dev/gomac-project-overview.md` (which is also somewhat stale relative to this section's build phases) into a single source of truth

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
- [ ] Primary screen size/location for visual resolution mode (drives the 1GB Pi's display setup)
- [ ] ESP32 node count and placement (zone-by-zone mapping TBD)

**Voice / UX**
- [ ] Wake word — custom or off-the-shelf (e.g., openWakeWord)?
- [ ] TTS engine selection (Piper, Coqui, ElevenLabs?)
- [ ] Whisper model size vs. 8GB Pi headroom tradeoff

**Software / Open Source**
- [ ] Repo structure and licensing
- [ ] Vehicle config file schema design
- [ ] Claude API integration pattern (tool use? structured outputs?)

### Session Log

| Date | Notes |
|---|---|
| 2026-05-15 | Session "SmartGomtuu" started. `notes/dev/CLAUDE.md` created. Reviewed all existing files. No purchases committed. Still in design/spec phase. |
| 2026-05-31 | OBD adapter decisions: WiCAN Pro (production) + Vgate iCar Pro WiFi (ordered, dev). Compute hub revised to laptop→RPi 5→Jetson progression to defer Jetson cost. Added Public Travel Site as architectural element. Phase 0 added for laptop prototyping (incl. Starlink data collection). |
| 2026-08-07 | Started working via Claude Code in this repo. Root `CLAUDE.md` (this file) created for repo/tooling guidance, then had `notes/dev/CLAUDE.md`'s domain content merged into it and that file removed — single source of truth going forward. Project renamed: the system is now **GOMAC** (Gomtuu's Automation, Telemetry, & Logistics); "Gomtuu" refers only to the van itself. Dropped Jetson from the compute-hub plan (at least for now); production compute hub is two Raspberry Pis already on hand — 8GB (primary compute) + 1GB (display/UI). `notes/dev/Gomtuu Specs.md` renamed to `Gomtuu Van Specs.md`, `notes/dev/gomtuu-project-overview.md` renamed to `gomac-project-overview.md`, `notes/dev/SmartGomtuu Architecture.canvas` renamed to `GOMAC Architecture.canvas`, all updated for the naming/hardware changes. Also: initial/dev OBD scanner changed to OBDLink MX+ (supersedes the earlier Vgate iCar Pro WiFi plan). Learned Starlink removed GPS from its local API in May 2026 — GPS source is now an open question; prototyping may use a custom Android service for phone GPS until a GPS dongle is acquired. |

---

## Key docs in `notes/dev/`

| File | Contents |
|---|---|
| `gomac-project-overview.md` | Canonical project overview — goals, architecture, features, build phases. Currently duplicates part of this file's "GOMAC — Project Overview" section — see Open Questions. |
| `Gomtuu Van Specs.md` | Van hardware spec sheet and build/punch-list (done vs. outstanding). This is about the physical van (Gomtuu), not the GOMAC software system. |
| `rv-automation-research.md` | Prior research on RV/12V home-automation state of the art. |
| `esp32.md` | ESP32 vs. Teensy 4.1 comparison notes. |
| `GOMAC Architecture.canvas` | Obsidian canvas — visual architecture diagram. |

## Repo layout

```
GOMAC
├── _layouts               # Jekyll layouts (legacy GitHub Pages support from template)
├── .github
│   ├── gitignore-templates
│   ├── ISSUE_TEMPLATE
│   ├── release-please      # release-please-config.json + manifest
│   ├── workflows            # release, docs deploy, template-init, starline badge
│   └── PULL_REQUEST_TEMPLATE.md
├── assets                  # Images/media, CSS for GitHub Pages
├── docs                     # VitePress site (deployed to GitHub Pages on push to main)
├── notes
│   ├── CHANGELOG.md         # Auto-generated by release-please — do not hand-edit
│   ├── TODO.md / VERSION.md
│   └── dev/                 # GOMAC project docs — see above
├── CONTRIBUTING.md
└── README.md
```

## Commands

Docs site (VitePress, in `docs/`):
```
cd docs
npm install
npm run docs:dev       # local dev server
npm run docs:build     # production build
npm run docs:preview   # preview the built site
```
There is no application build/lint/test suite yet — no code has been written for the GOMAC platform itself.

## Conventions

- **Commit messages**: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, etc.) — required, since `release-please` derives version bumps and `notes/CHANGELOG.md` from them. `feat!:`/`fix!:` for breaking changes.
- **PRs**: use `.github/PULL_REQUEST_TEMPLATE.md`.
- Docs deploy workflow (`.github/workflows/docs.yml`) only triggers on pushes to `main` under `docs/**` — irrelevant until the docs site has real content.

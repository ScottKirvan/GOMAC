# GOMAC Hub — Design Spec

This is the implementation-level design spec for **the GOMAC hub itself** — the standalone service described in `gomac-project-overview.md`'s System Architecture section, and this repo's primary deliverable. That doc covers the product-level "what and why" (goals, features, hardware, build phases); this one covers the hub's own "how" (license, engine, provider architecture, module shape). Where both docs have an Open Questions section, they're scoped differently on purpose — project-level questions (hardware, GPS sourcing, etc.) stay in the overview doc; hub-implementation questions live here — to avoid the duplication this project already got bitten by once.

## License

**MIT**, open source. Already in place at the repo root (`LICENSE.md`, Scott Kirvan) — no separate license needed for the hub specifically, it's covered by the repo's existing license.

## Primary Engine

**Claude Code CLI**, authenticated via a Claude Pro/Max subscription (same auth model as BojuBot). This is the default and the engine for anything mission-critical: safety-relevant reasoning, resource management, automations, predictive maintenance, core trip-intelligence planning. Wrapping the CLI rather than calling the raw Anthropic API directly means inheriting its agentic tool-use loop instead of building one — see `gomac-project-overview.md`'s "GOMAC — the Hub" section for the full rationale.

## Multi-Provider AI Routing

### Motivation

**Cost, not capability.** This isn't about picking the "best" model per task — it's about not spending Claude usage on queries that don't need it. Reserve Claude for mission-critical reasoning; offload lightweight, non-critical, exploratory queries elsewhere.

### The Puka Shell Tour Guide role

A distinct, lower-stakes role GOMAC plays: local exploration / tourist-guide queries, using current GPS location as context. Examples given:
- *"Find me a dive bar nearby"*
- *"What's some good alt-culture things to see and do in Montreal?"*
- *"What types of trees am I seeing?"*

Explicitly **not** mission-critical — imperfect answers here aren't a real problem the way a bad predictive-maintenance call would be. That's what makes them safe to route to a cheaper/different backend.

**Confirmed**: "what trees am I seeing" is a location+season *knowledge* question — what species are typically found in this region right now, reasoned from GPS + time of year — not a camera/image-labeling task. No vision capability needed for this role, consistent with vision not currently being planned elsewhere in this project.

### Candidate providers

Same integration pattern as the primary engine: wrap each as an external CLI-based agent, not a raw API call.

- **Gemini CLI** (Google, Apache 2.0, open source, verified current). Genuinely well-suited to this role specifically — it ships a Google Search MCP integration, giving grounded, current local results, which is exactly what "what's a good dive bar nearby" needs. Free tier via a personal Google account. **Worth watching**: Google announced "Antigravity 2.0" at I/O 2026 as a replacement for Gemini CLI aimed at consumer users — unclear yet whether Gemini CLI remains the right long-term integration target or whether Antigravity becomes it. Not blocking today, just flagged.

- **Ollama** (local/self-hosted model runner) — verified current, genuinely viable, but with a real hardware conflict on the currently-planned compute hub. This is not a capability gap the way it might have been a year or two ago: Ollama now ships an official web-search capability and native tool/function calling, following the same "model calls a tool, code runs it, result feeds back" agent loop as Claude Code CLI or Gemini CLI — so it can do grounded, current lookups, not just answer from frozen training data.

  What makes it worth including despite the hardware conflict: it's the **only candidate that works fully offline**. GOMAC's own design principle already says core functions should degrade gracefully with no cloud — Ollama is the one option philosophically aligned with that, not just cheaper. Real value proposition, distinct from "saves tokens."

  **The hardware conflict, specifically**: Ollama's own docs currently recommend `qwen3:8b` for reliable tool-calling — roughly 6-8GB RAM in use. The compute hub's 8GB Pi 5 is the *same box* slated to run Home Assistant, Mosquitto, Whisper, and GOMAC itself; an 8B model would consume essentially the whole machine, competing directly with everything else already committed to it. Smaller models (1B-3B) fit the RAM (4GB is enough) and run at usable speeds (roughly 5-20 tokens/sec on Pi 5 CPU depending on size), but tool-calling reliability at that size is **unproven** — the sources found specifically call out the 8B model as "the most consistent small model in agent testing," not the smaller ones. Untested claim either way; needs empirical testing on real hardware before deciding, not assumed from spec-level reasoning.

  **This means Ollama likely requires either a hardware upgrade (e.g. a 16GB Pi 5 instead of 8GB) or a separate dedicated machine for local inference — not a drop-in addition to the currently-planned 2-Pi compute hub.** A Raspberry Pi AI HAT+ 2 add-on (Hailo-10H chip) exists and accelerates inference 5-10x, but that only helps speed, not the RAM contention — worth being precise about that distinction so it doesn't get assumed to solve both problems.

**Considered and dropped: GitHub Copilot CLI.** Its toolset is built and marketed specifically as a *coding* agent — repo analysis, code review, planning/building software — not a general knowledge or location-aware assistant, which was a real mismatch for Puka Shell duties. Decided not to pursue it.

### Open design questions (this doc's, not the project overview's)

- **Routing mechanism** — how does GOMAC decide a query is Puka-Shell-scope vs. core reasoning? Options, not yet chosen between:
  - An explicit mode/wake-phrase ("tour guide" mode, switched into deliberately)
  - A lightweight local classifier/heuristic (keyword or intent-based) that runs before any model is invoked
  - Claude triages every query first, then delegates — simplest to build, but partially defeats the cost-saving purpose, since Claude still sees (and gets billed for) every query even ones it hands off
- **Selectability granularity** — is the provider a config-level default per role (set once, e.g. "Puka Shell → Gemini"), or something switchable live mid-conversation ("use Gemini for this one")? Affects both the config schema and the UX.
- **Provider abstraction shape** — presumably a thin adapter per CLI (invoke as subprocess, parse output, handle auth/credentials), a natural extension of how the Claude Code CLI wrapping already works. Worth designing once the questions above are settled, not before.

## Tool-Calling / Home Assistant Integration

Recap — full detail in `gomac-project-overview.md`'s System Architecture: GOMAC exposes a small, deliberate toolset (`get_tank_level`, `run_automation`, `query_battery_soc`, `set_scene`, etc.) implemented as calls into Home Assistant's REST/WebSocket API and MQTT. Not an HA add-on, not embedded in HA — a peer service.

## Automation Authoring

**Yes — GOMAC will be able to write new HA automations from a plain-English description, not just trigger pre-existing ones.** This isn't speculative; it's a proven pattern with real prior art: [AItomation](https://github.com/gmatrangola/AItomation) is an existing open-source project doing exactly this — plain-English description in, LLM-generated automation (trigger/condition/action) out, pushed live to HA via its REST API, with context-awareness of the user's actual entities and services. Worth treating as a second architectural reference alongside BojuBot — same shape of project, HA instead of Obsidian.

**Mechanism**: HA automations are structured config (trigger/condition/action) that HA exposes a REST/config API to create and update programmatically. GOMAC drafts that structure from the natural-language request, pushes it through the API, HA validates and can enable it.

**Design fork, not yet decided**: Home Assistant ships its own [built-in LLM API](https://developers.home-assistant.io/docs/core/llm/) — a native mechanism for exposing HA's entities/services to an AI, which custom integrations can extend with additional tools. GOMAC could lean on that native API (less to build and maintain) rather than only using its own custom toolset calling the config API directly. Not mutually exclusive — GOMAC's Claude Code CLI wrapper could treat HA's native LLM API as one of its own tools. Needs a decision when this gets built, not assumed now.

**Permission-model tie-in — this is the concrete second example the Permission Model section needed.** Authoring a brand-new automation is meaningfully more powerful than "standard" tier's pre-approved safe automations (lights, AC, scenes) — it's open-ended trigger/condition/action logic, not something already vetted. Designed as **propose-then-confirm**, not silent-write-and-enable: GOMAC drafts the automation, shows a plain-English summary (and the underlying YAML on request) for confirmation before it goes live — the same shape as a PR review: draft, show the diff, get sign-off, then merge/enable.

**Ambiguity discipline applies here too.** Vague requests produce bad automations — "turn off the lights when nobody's around" doesn't specify duration, which lights, or motion-vs-time triggering. GOMAC authoring automations should ask a clarifying question rather than guess at trigger semantics for something about to run unattended and control real things in the van — the same "don't bake in assumptions, check first" discipline already governing how Claude Code is supposed to work in this repo, now built into the product itself.

## Permission Model

Recap — full detail in the overview doc: BojuBot's readonly/standard/full security-mode concept, borrowed directly. Readonly: state queries only. Standard: pre-approved safe automations. Full: reserved for anything riskier, decided case by case (e.g. CAN-bus writes, if ever pursued; **authoring new automations, gated as propose-then-confirm — see Automation Authoring above**).

## Implementation Language / Runtime

**Decided: TypeScript/Node.** The daemon's job is I/O orchestration (MQTT, HA's REST/WebSocket API, subprocess management for Claude Code CLI and other providers), not computation — the kind of workload async/event-driven runtimes are built for, not one where C/C++'s performance/control advantages actually pay off. That mattered more once the rendering situation was clarified (see Interface below): the compute Pi is headless, so any GUI has to be served over the network to a physically separate display device, which makes real-time WebSocket push to a remote client a core requirement, not an optional nicety — squarely Node's home turf. Combined with direct code/pattern reuse from BojuBot (see below), one language end-to-end (backend daemon + served web UI, shared types) won out over Python's easier bootstrap or C/C++'s raw control.

C/C++ was considered — it's a legitimate strength, just not for this component. It has a real home elsewhere in this project: the ESP32 firmware layer is genuinely embedded/real-time/memory-constrained work, where C/C++ is the correct tool rather than a compromise. Worth noting too: for a daemon that runs unattended for weeks at a time with nobody around to notice a crash, a managed-memory language's reliability profile is arguably the more rigorous choice for *this* component, not the shortcut.

## Interface

**Headless compute, remote rendering.** The compute Pi has no local display — any rendered interface (the escalated/visual-mode tier described in `gomac-project-overview.md`'s Open Questions) is necessarily served over the network to a separate device (the 1GB display Pi, and potentially other clients like a phone). This settles the interface architecture as client-server by hardware necessity, not just design preference: the daemon serves a web UI (HTTP + WebSocket for live state push), and remote devices are thin clients running nothing but a browser. A native local GUI toolkit was never actually on the table once the headless constraint was clear.

**Reuse and refactor BojuBot.** Since GOMAC's UI is being built in the same language and general shape as BojuBot's (a modern, interactive, clean interface wrapping a Claude Code CLI-based agent), this is a real opportunity to extract genuinely reusable code out of BojuBot rather than just copy-pasting patterns by hand — a shared library/package for the pieces that aren't Obsidian-specific: the Claude Code CLI wrapping/agentic-loop plumbing, the readonly/standard/full permission-mode system, live-updating chat-UI components, WebSocket state-sync patterns. If it's reusable enough for a second, quite different project (a note-taking plugin vs. a van automation hub) on the first attempt, it's plausibly useful to other people building Claude Code CLI-wrapped tools too — worth keeping that in mind given both projects are MIT/open source. Scope of the extraction (what specifically moves into a shared package vs. stays BojuBot-specific) is not yet defined — see Open Questions.

## Voice Input

Still brainstorming — not a decided design, captured here so the thread isn't lost. Two (not competing) mechanisms in play:

- **Wake-word / always-listening.** Already tracked as an open question in `gomac-project-overview.md` (custom vs. off-the-shelf, e.g. openWakeWord). Complementary to PTT below, not an alternative to it.
- **Push-to-talk (PTT).** Two physical forms under consideration:
  - A **phone PTT app** (or a page within GOMAC's own served web UI) — low cost given the Interface decision above: the WebSocket infrastructure for the display already needs to exist, so a PTT button and audio stream over that same channel is a small addition, not new infrastructure. Works from anywhere in or near the van, no wiring.
  - A **wired CB-radio-style handset** — more work, more delightful, and thematically on-brand. Real hardware exists for this (PTT handsets/footswitches are a known quantity in ham radio/dispatch-console applications), so it's assembly, not invention.

**One design principle is settled even though the mechanism isn't: PTT audio input routes through MQTT, the same as everything else in this project, rather than being a special-cased direct wire to wherever the GOMAC daemon happens to run.** Concretely: a wired handset's PTT button and mic would connect to the *nearest* ESP32 node, not travel the length of the van to the (likely distant, headless) compute Pi — pressing the button publishes a trigger to MQTT, the same pattern already used for tank sensors and relays. PTT is treated as a generic concept — a trigger plus an audio stream — with multiple physical sources (phone app, wired handset) able to feed the same backend handling, all converging through the bus rather than each needing its own bespoke path into the daemon. This keeps audio input architecturally consistent with the rest of the system instead of becoming a special case.

## Open Questions

- [ ] Routing mechanism for Puka Shell vs. core queries (see above)
- [ ] Provider selectability granularity: config default vs. live-switchable
- [x] GitHub Copilot CLI considered as a Puka Shell provider and dropped — coding-agent focus was a real mismatch for tourist-guide queries
- [x] Confirmed: "what trees am I seeing" is a location/season knowledge question, not camera vision
- [ ] Whether to pursue Ollama as a Puka Shell provider, and on what hardware — the currently-planned 8GB compute Pi doesn't have headroom for a reliable tool-calling model (~6-8GB RAM) alongside HA/Mosquitto/Whisper/GOMAC. Would need a RAM upgrade (e.g. 16GB Pi 5) or a separate dedicated machine.
- [ ] Whether small (1B-3B) Ollama models are reliable enough at tool-calling to fit the existing 8GB Pi without a hardware change — unproven, needs empirical testing on real hardware, not assumed
- [x] Implementation language/runtime for the hub: TypeScript/Node — see Implementation Language / Runtime above
- [ ] Provider adapter abstraction shape (after the routing/selectability questions settle)
- [ ] BojuBot refactor scope — which pieces move into a shared package (Claude Code CLI wrapping, permission modes, chat-UI components, WebSocket state sync) vs. stay Obsidian-specific
- [ ] PTT mechanism — phone app, wired CB-style handset, or both; the MQTT-routing principle is decided, the physical form isn't
- [ ] Where audio input physically originates relative to the headless compute Pi (same remote/thin-client pattern as the display — see Interface)
- [ ] Whether automation authoring uses HA's native LLM API, GOMAC's own custom toolset against HA's config API, or both — see Automation Authoring above
- [ ] Exact propose-then-confirm UX for authored automations (where the draft/confirm step surfaces — the served web UI, presumably, but not yet designed)

## References & Prior Art

- [BojuBot](https://github.com/ScottKirvan/BojuBot) — architectural and naming model, see `gomac-project-overview.md`
- [Gemini CLI announcement](https://blog.google/innovation-and-ai/technology/developers-tools/introducing-gemini-cli-open-source-ai-agent/) — Google, open source, Apache 2.0
- [Ollama web search capability](https://docs.ollama.com/capabilities/web-search), [Ollama tool calling guide](https://localaimaster.com/blog/ollama-tool-calling-guide) — grounding for the Ollama candidate above
- [Raspberry Pi 5 LLM benchmarks](https://localaimaster.com/blog/llm-raspberry-pi-5), [Running LLMs on Raspberry Pi 5](https://tinyweights.dev/posts/run-llms-raspberry-pi-5/) — RAM/tokens-per-second figures behind the hardware-conflict note above
- [AItomation](https://github.com/gmatrangola/AItomation) — existing open-source project doing plain-English-to-HA-automation exactly as described above; second architectural reference alongside BojuBot
- [Home Assistant LLM API](https://developers.home-assistant.io/docs/core/llm/) — HA's own native mechanism for exposing entities/services to an AI, relevant to the design fork above

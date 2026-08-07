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

One open question worth flagging on the last example: "what trees am I seeing" reads two ways — a location+season *knowledge* question (what species are typically found in this region right now — no camera needed), or an actual *visual identification* question (requires a camera and image analysis). Vision is explicitly not currently planned elsewhere in this project (see the overview doc's Open Questions). Defaulting to the knowledge-question reading unless told otherwise — flagging it rather than silently assuming.

### Candidate providers

Same integration pattern as the primary engine: wrap each as an external CLI-based agent, not a raw API call.

- **Gemini CLI** (Google, Apache 2.0, open source, verified current). Genuinely well-suited to this role specifically — it ships a Google Search MCP integration, giving grounded, current local results, which is exactly what "what's a good dive bar nearby" needs. Free tier via a personal Google account. **Worth watching**: Google announced "Antigravity 2.0" at I/O 2026 as a replacement for Gemini CLI aimed at consumer users — unclear yet whether Gemini CLI remains the right long-term integration target or whether Antigravity becomes it. Not blocking today, just flagged.

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

## Permission Model

Recap — full detail in the overview doc: BojuBot's readonly/standard/full security-mode concept, borrowed directly. Readonly: state queries only. Standard: pre-approved safe automations. Full: reserved for anything riskier, decided case by case (e.g. CAN-bus writes, if ever pursued).

## Implementation Language / Runtime

**Not yet decided — open.** BojuBot is TypeScript/Node, but that's a constraint of being an Obsidian plugin (Obsidian's plugin API is JS/TS-only); GOMAC has no equivalent host constraint, since it's a standalone service, not a plugin. Worth weighing: Home Assistant's own ecosystem (integrations, community tooling) is heavily Python; the Claude Agent SDK has both Python and TypeScript SDKs; Gemini CLI (and any future provider) is invoked as an external subprocess either way, so the hub's own language doesn't need to match theirs. No recommendation yet — this needs your call, not mine, given how foundational it is.

## Open Questions

- [ ] Routing mechanism for Puka Shell vs. core queries (see above)
- [ ] Provider selectability granularity: config default vs. live-switchable
- [x] GitHub Copilot CLI considered as a Puka Shell provider and dropped — coding-agent focus was a real mismatch for tourist-guide queries
- [ ] Whether "what trees am I seeing" implies camera vision (not currently planned) or a location/season knowledge query (default assumption)
- [ ] Implementation language/runtime for the hub itself
- [ ] Provider adapter abstraction shape (after the above settle)

## References & Prior Art

- [BojuBot](https://github.com/ScottKirvan/BojuBot) — architectural and naming model, see `gomac-project-overview.md`
- [Gemini CLI announcement](https://blog.google/innovation-and-ai/technology/developers-tools/introducing-gemini-cli-open-source-ai-agent/) — Google, open source, Apache 2.0

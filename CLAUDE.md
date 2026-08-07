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
- **You are not the only one working in this repo.** Human contributors and other coding agents touch it too, without this file loaded. Don't fold general project/domain documentation into Claude-only files (like this one) just because that's convenient for you — it has to stay readable and discoverable for everyone, in plain docs like `notes/dev/gomac-project-overview.md`. Reserve this file for guidance that's genuinely specific to Claude Code.

## Repo state

This repo was generated from [ScottKirvan/ScooterGitTemplate](https://github.com/ScottKirvan/ScooterGitTemplate) and has **not yet been customized** — `README.md` and `docs/index.md` still contain template placeholder/lorem-ipsum text (see the "Customization Checklist" in `README.md`). Don't treat that placeholder copy as real project content.

The actual substance of this project lives in **`notes/dev/`**, which documents **GOMAC** (Gomtuu's Automation, Telemetry, & Logistics): an intelligent, voice-first vehicle automation and trip-planning platform.

**Naming: GOMAC is the system, Gomtuu is the van.** Gomtuu is Scott's 2005 Mercedes T1N Sprinter (full-time live-aboard, off-grid) — named after the living ship in the Star Trek TNG episode "Tin Man." GOMAC is the automation/intelligence platform being built for her. Don't conflate the two in docs: hardware that belongs to the physical vehicle is "Gomtuu's," the software/systems platform is "GOMAC."

It's currently in the **design/spec phase — no application code has been written yet, and no hardware purchases beyond what's listed as existing have been committed to.**

This file is now the single source of truth for repo/tooling guidance and Claude-Code-specific working rules. GOMAC's domain context (project overview, architecture, build phases, hardware, open questions, session log) lives in **`notes/dev/gomac-project-overview.md`** — that's the main project doc, written for human contributors and any coding agent, not just Claude Code, since not everyone working in this repo will have this file loaded. Read it first for GOMAC context; update it (not this file) as decisions are made and the design evolves.

Scott previously kept a separate `notes/dev/CLAUDE.md` for Claude-specific domain context (for a different, Obsidian-vault-scoped tool) but has moved to working out of this repo via Claude Code exclusively, so that file was merged in here and removed — its content was genuinely Claude-context, unlike the general project overview. The one-line `notes/dev/Hardware Reference.md` (a single WiCAN-PRO link) was folded into `gomac-project-overview.md`'s Existing Hardware / References sections and removed as redundant.

---

## Key docs in `notes/dev/`

| File | Contents |
|---|---|
| `gomac-project-overview.md` | **Main project doc.** Canonical GOMAC overview — goals, architecture, features, build phases, existing hardware, technical constraints, open questions, session log. Written for humans and any agent, not just Claude Code. |
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

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Keeping This File Current

This file is the primary context for any agent working in this repo — keep it accurate as the project evolves. When key files, build commands, and architectural decisions emerge, record them here so future sessions start with full context rather than re-deriving it.

Update this file in the same commit as the work it documents.

## Operating rules (hard requirements)

1. **Never commit or push to `main` without explicit, in-the-moment instruction to do so.** Always develop on a feature branch and open a PR for Scott to review. This holds even for small doc edits.
2. **Branch names must be meaningful and descriptive of the work** (e.g. `docs/add-root-claude-md`), never a generic/auto-generated name like `claude/initial-setup-4vzll0`. If a session starts on a pre-assigned generic branch name, rename it (`git branch -m`) before pushing/opening a PR.
3. **One concern per branch and PR.** If work naturally splits into independent problems, split the branches too — resist bundling unrelated changes into one PR. If a name is already taken, pick a more specific descriptive name rather than adding a generated suffix.
4. **Don't use the multiple-choice question tool to ask Scott things.** If something is ambiguous, ask in plain conversational language instead. Some interfaces render binned/multiple-choice questions poorly, and forcing a question into fixed options loses the nuance an open question would surface.
5. **No Claude/AI attribution anywhere pushed to this repo** — not in commit messages (no `Co-Authored-By`, no session links), not in PR titles/bodies, not in PR/issue comments, not in code comments. Default GitHub-integration behavior may try to append an attribution footer to PR/issue posts — strip it before submitting, and **verify by reading what actually landed, not from memory:**
   - Run `git log` and read the actual commit messages
   - Re-fetch and read the actual PR body text
   - Remove any attribution found, regardless of source

   A commit or PR is not finished until this read-back check has run.
6. **Scott merges PRs himself using "rebase and merge"** (to keep release-please's changelog generation working correctly) and deletes the branch afterward. Don't assume a PR is still open without checking — sync `main` and prune local branches before starting new work.

## Working with Scott

Scott is a senior software engineer and systems architect. He works from first principles and prefers rolling his own systems and doing the extra work to use existing hardware over taking shortcuts or working around the limitations of off-the-shelf libraries/packages — homebrew over commercial black boxes.

- **Don't bake in assumptions that make a task easier without checking with him first.** Surface the tradeoff and let him decide, even if it slows things down.
- **Nothing is deferred without his explicit permission.** Don't quietly punt on a hard part of the spec or implementation. A known issue is still a bug — don't mark it "won't fix", "by design", or "out of scope" unilaterally. If a library or package cannot meet the stated requirements, find an alternative or do the work from first principles — don't revise the requirements to fit the limitation.
- **Make implementation decisions independently.** Don't ask permission for technical choices within the stated requirements. Escalate only when something would change scope, defer a requirement, or contradict what Scott has described as the goal.
- **When a sub-agent takes a shortcut, or declares something "not a bug" without actually having implemented or verified it, call that out explicitly** rather than passing it through as if it were solid.
- **You are not the only one working in this repo.** Human contributors and other coding agents touch it too, without this file loaded. Don't fold general project/domain documentation into Claude-only files (like this one) just because that's convenient — it has to stay readable and discoverable for everyone, in plain docs like `notes/dev/gomac-project-overview.md`. Reserve this file for guidance that's genuinely specific to Claude Code.

## GitHub Issues and PRs

Issue and PR templates live in `ScottKirvan/.github` and apply to this repo automatically via GitHub's community health file fallback.

- Bug reports → `[BUG]` title prefix, `bug_report.md` sections
- Feature requests → `[FEATURE]` title prefix, `feature_request.md` sections
- General → `[GENERAL]` title prefix, `general_report.md` sections
- PRs → fill all checklist sections; no attribution anywhere in the body

Before creating any issue, check for duplicates first: `gh issue list --state open --limit 100`. Create issues only when explicitly asked — don't preemptively file future work.

## Sub-Agent Workflow

When using sub-agents for implementation:

- Brief sub-agents on **what** to build, not **how** — implementation decisions belong to the sub-agent, which serves as an independent second opinion on the approach.
- Sub-agents follow all conventions in this file except they do not create PRs.
- After a sub-agent completes, review its diff and tests before creating the PR. This review is a genuine code review, not a compliance check — evaluate correctness, requirement alignment, and test quality independently.
- Simple issues found in review may be fixed directly. Significant deviations from the stated requirements or complex problems go back to the sub-agent rather than being patched over.
- Create the PR only after review passes.

---

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
| `gomac-hub-spec.md` | Implementation-level design spec for the GOMAC hub itself (this repo's primary deliverable) — license, engine, multi-provider AI routing, permission model, open implementation questions. |
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

- **Commit messages**: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, etc.) — required, since `release-please` derives version bumps and `notes/CHANGELOG.md` from them. `feat!:`/`fix!:` for breaking changes. **`feat:` is for genuinely new user-facing capabilities only** — bug fixes and corrections use `fix:` even when closing a tracked issue.
- **PRs**: use `.github/PULL_REQUEST_TEMPLATE.md`.
- **No comments by default.** Add a comment only when the *why* is non-obvious — a hidden constraint, a subtle invariant, a workaround for a specific bug. If code is hard to understand, the fix is clearer naming and structure, not a comment explaining what it does.
- **Prefer narrow, localised changes.** A fix or feature should not require touching unrelated parts of the codebase. If it does, that's a design signal worth surfacing.
- **Refactoring is a first-class activity**, not something to defer. Improve structure as you go rather than accumulating technical debt for a later pass.
- **In unfamiliar domain territory, prefer primary sources** — official docs, specs, RFCs — over general knowledge. Flag domain uncertainty explicitly rather than proceeding on an assumption.
- **When application code exists:** Unit tests must be written alongside all new code. Bug fixes require a failing test that reproduces the bug, then the fix that makes it pass (red/green).
- **When a build/test toolchain is established:** CI, lint, and formatting must all pass before committing or opening a PR. Discover the project's commands from the CI config, `Makefile`, or equivalent — do not assume they match another project's toolchain.
- Docs deploy workflow (`.github/workflows/docs.yml`) only triggers on pushes to `main` under `docs/**` — irrelevant until the docs site has real content.

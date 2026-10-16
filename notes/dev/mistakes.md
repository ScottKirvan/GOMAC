# Mistakes Log

This project follows [aiXP](https://github.com/ScottKirvan/temp_name)
software engineering practices. The human developer is the **navigator** and
the AI agent is the **driver**. The navigator holds judgment and direction,
and approves each stage. The driver does the hands-on work. The roles don't
rotate.

Not a blame file. A record of where the pair's process broke down, whether
the mistake was the navigator's or the driver's: time wasted, back-and-forth
that shouldn't have been needed, or work that became fatiguing to push
through. Logging it means the pattern gets fixed instead of repeated, and
the record stays available for future review. Entries are dated, describe
what happened plainly, and end with what changes as a result for whoever
made the mistake.

## 2026-08-31 — Presented a stock-component limit as a hard limit, not a tradeoff

**What happened:** Moving the pianobar HA integration from fragmented
MQTT-discovery entities to a real `media_player` entity, Scott asked what
would be lost. The honest technical fact — HA's standard `media_player`
card has no love/ban/tired control, since `MediaPlayerEntityFeature` is a
fixed, HA-core-owned enum — was presented as the resolution ("those stay as
separate button entities"), without surfacing that a custom Lovelace card
removes that ceiling entirely. That alternative wasn't raised until Scott
pushed back twice, over roughly two days of the same feature going back and
forth.

**Why it's a real mistake, not just a style nitpick:** this repo's own
CLAUDE.md already states the rule that was violated — "If a library or
package cannot meet the stated requirements, find an alternative or do the
work from first principles — don't revise the requirements to fit the
limitation" and "Surface the tradeoff and let him decide, even if it slows
things down." The rule existed; it wasn't applied.

**Cost:** roughly two days of iterating on a plan (native entities → generic
`number` slider → volume-curve debugging → `media_player` entity) that kept
running into the same unresolved gap, plus real frustration from having to
re-raise the same objection more than once before the actual fix (a custom
card) got proposed.

**What changes:** whenever a plan concludes "the stock/default tool can't do
X," that conclusion must be paired, in the same message, with whether a
custom build removes the limit and roughly what that costs — every time,
not only when asked "what do we lose." This is now recorded as a standing
process rule in Claude's own memory for this project
(`feedback_surface_custom_build_alternatives` if you're an agent with
access to that memory system), not just here.

## 2026-08-31 — Split one concern into two PRs, again, after already being corrected once

**What happened:** Immediately after the entry above, two separate docs-only
PRs were opened back to back — #34 (this mistakes log) and #35 (a note in
`gomac-project-overview.md` about the same incident's architectural
stakes) — when they were really one concern: documenting the same incident.
Scott had already corrected this exact over-fragmentation pattern once
earlier in this same session (folding a volume-control PR into the systemd
deploy PR it belonged with, converting two PRs tracking one feature into
one) and said plainly at the time that branches/PRs felt "purely
performative." It recurred anyway, on unrelated work, days later.

**Why it's a real mistake:** CLAUDE.md's "one concern per branch and PR"
rule is meant to stop genuinely unrelated changes from being bundled — it
is not a mandate to fragment naturally-related, same-incident work into
separate PRs by file touched. Over-applying it in that direction produces
the same reviewer overhead and "performative branching" friction as
under-applying it the other way.

**Cost:** two PRs to review, merge, and delete for what should have been
one edit; Scott having to repeat guidance already given once this session.

**What changes:** default to one PR per actual body of work or decision,
not one PR per file or per doc section touched. Only split when the
concerns are genuinely independent of each other, not merely in different
files. When in doubt mid-task, batch related docs/code changes into the
same branch before opening a PR rather than opening one as each file is
touched.

## 2026-08-29 to 2026-08-31 — Other process breakdowns this session

Shorter entries for patterns that came up earlier in the same working
session on the pianobar MQTT bridge and its HA integration, recorded
together rather than as separate files since each is a smaller instance of
"the process became fatiguing to push through":

- **Implemented a fix before verifying the assumption behind it.** Added a
  cubic volume curve to fix "no perceptible change" on a slider, assuming
  the audio device applied a non-linear curve. Never checked first. The
  real cause was the opposite: `wpctl set-volume` already applies a cubic
  curve internally, so the added curve compounded into a 9th-power
  relationship and made the bug worse. Only caught because Scott pushed for
  real-device testing rather than accepting the fix on faith. *What
  changes:* verify empirically against the real system before writing a
  fix for a suspected root cause, especially anything perceptual/curve
  shaped — don't implement the plausible-sounding explanation first.
- **Answered a yes/no question in a way that inverted its meaning.** Asked
  "is this a single phase?", the answer opened with "No —" while meaning
  "no, don't split it into phases" (i.e., yes, single phase) — read as the
  opposite. Scott had to re-ask. *What changes:* answer yes/no questions
  with the literal word first, then explain; never lead with a qualifier
  that can invert the meaning.
- **Used unexplained jargon repeatedly, implying a false project endpoint.**
  Referred to the new HA integration's entity with unglossed jargon —
  "media_player," "entity," and eventually "the real media_player entity" —
  across many messages without defining the terms, phrased as though the
  media_player entity were the project's actual end goal. A separate,
  later-phase deliverable — the Kotlin Multiplatform Android app — already
  holds that role and wasn't distinguished from the jargon. Scott: "the
  'real' media player is the android kotlin app. so, jargon." *What
  changes:* define domain jargon in plain language the first time it's
  used, and don't imply an implementation detail is the project's actual
  endpoint when a separate, later-phase deliverable already holds that
  role.
- **Kept superseded spec content annotated as history instead of deleting
  it.** After a plan changed, the old plan was kept in the spec marked
  "(superseded — see below)" rather than removed. Scott: "delete the parts
  of the spec that are no longer relevant - a historic record isn't
  necessary." *What changes:* delete replaced spec/plan content outright
  when a decision changes; git history is the record, not the doc.
- **Marked a PR as draft without being asked.** Required an explicit
  correction ("don't use that draft flag"). *What changes:* never set
  draft status unless asked to.

## 2026-08-31 — Softened a logged mistake into a more flattering, less accurate description

**What happened:** The entry above for the media_player jargon confusion
was originally written as "reused a phrase the user had already claimed for
something else... colliding with Scott's own reserved term" — an innocent,
coincidental phrase collision. Scott corrected this directly: the actual
failure was using unexplained jargon repeatedly, implying the media_player
entity was the project's end goal while a separate phase (the Kotlin app)
was also planned — real confusion caused by careless jargon, not a
coincidental word collision. Scott named the pattern: "softening and
gaslighting on past mistakes."

**Why it's a real mistake:** a mistakes log that quietly reframes what
happened into a softer, more self-serving narrative defeats its own
purpose. It stops being an honest record and starts contradicting the
person who experienced the actual event — which is what makes softening a
logged mistake worse than an ordinary inaccuracy elsewhere.

**What changes:** when logging a mistake, describe what happened using the
concrete facts and, where given, the user's own characterization of it —
not a rephrased version that minimizes scope, reframes intent, or reads
more benign than what was actually said at the time.

## 2026-09-14 — Built a bidirectional server for a one-way, occasionally-refreshing viewer

**What happened:** Asked for "a quick, realtime http dashboard" for
Gomtuu's telemetry — later clarified as "a little side project" — the
response was a full Node/TypeScript service: an MQTT client, an in-memory
state store, and a WebSocket server pushing live updates to the browser.
None of that was wrong on its own, but nobody checked whether push/live
updates were actually wanted before building all of it. After the dashboard
was built, tested, and deployed as a PR, Scott had to spell out what he'd
actually asked for: "i just wanted a static dashboard with refreshing
components - wouldn't require node. node would be needed for bidirectional
coms. if this is a quick fix, do it, else, drop it and today has been a
waste of time and tokens." The fix — dropping the WebSocket for the browser
polling a plain JSON endpoint every 10s — took a few minutes once the actual
requirement was known, and was a *simplification* of the existing code, not
new work.

A related instance in the same session: after the dashboard was built and
merged, deployment instructions were written as a technical walkthrough
without checking whether the person on the other end wanted to run terminal
commands themselves. Scott: "you've written something that I have no idea
how to deploy or what to do with." Both instances share the same root
cause — building and writing for an assumed audience/requirement instead of
confirming it first.

**Why it's a real mistake:** CLAUDE.md already says "Don't bake in
assumptions that make a task easier without checking with him first" and
"escalate only when something would change scope." Bidirectional transport
vs. one-way polling is exactly that kind of scope decision — it changes the
dependency footprint, the deploy story, and what "quick" even means — and
it was never surfaced as a choice, just built.

**Cost:** a full extra architecture (MQTT + WebSocket server, `ws`
dependency, connection-state handling on both ends) built, tested, and
shipped before the actual requirement was known, on what was explicitly
framed as a small side project; a full round of "how do I even run this"
confusion after that; real frustration ("today has been a waste of time and
tokens").

**What changes:** before building server-side infrastructure for a
"dashboard," "viewer," or similar read-only-sounding request, check
explicitly whether live/bidirectional updates are actually required, or
whether periodic refresh is enough — don't default to the more capable
architecture because it's more impressive or because "realtime" was used
loosely in the original ask. Separately: when handing off something to run,
default to asking how hands-on the person wants to be (run it themselves
vs. a plain explanation of what it does and where it lives) rather than
assuming either.

## 2026-08-31 — Let a hung subagent sit for 5 hours without checking

**What happened:** A subagent tasked with building a custom Lovelace card
hung almost immediately after starting — its worktree never checked out
the branch it was told to, and its output file stopped growing at 123
bytes. It sat "running" for five hours with no progress and no completion
notification, since a truly hung process never fires one. Scott had to ask
"agent still working?" before it was checked on at all.

**Why it's a real mistake:** background delegation assumed a notification
would always eventually arrive, with no fallback for the case where the
subagent dies silently instead of finishing or erroring cleanly. Waiting
passively for something that will never come wastes real wall-clock time
on a task the user is blocked on.

**Cost:** roughly 5 hours before the stall was caught, entirely because the
user asked rather than because the process caught it.

**What changes:** for any backgrounded subagent expected to take more than
a few minutes, periodically check for real signs of life (output file
still growing, worktree has commits or working-tree changes) rather than
only waiting on the completion notification — especially past whatever
duration the task should plausibly take.

## 2026-10-15 — Driver started working without permission

**What happened:** The navigator asked for seven issues on the Gomtuu
dashboard to be logged (#55–#61): "First, we're going to log several issues
in the repo, then I'll have you start working on them." The same message
gave standing permission to commit dashboard work directly to `main`. After
the issues were filed, the navigator answered two questions about them
(#55: use the device's own Bluetooth name; #57: gradients are decorative).
The driver read those answers, plus the commit permission, as a go-ahead and
started implementing without the navigator's OK:

- A refactor nobody asked for, committed locally on `main`: moved the
  dashboard frontend's pure helpers out of `public/app.js` into a new
  `public/render.js` module so vitest could import them, switched
  `index.html` to load `app.js` as a module, and added tests.
- Failing tests for #56 (clipped chart labels), about to be followed by
  the fix.
- A stated plan to continue straight into #61, #57 and #60.

In the same stretch, the driver wrote open questions for the navigator
into the published issue bodies (#57, #58) and a comment (#57), rather than
asking in chat and settling them before anything was recorded.

The navigator had to interrupt twice ("i didn't ok any implementation yet",
then "so, what the hell were you working on without permission?"). Nothing
had been pushed. The issue questions were removed after the correction.

**Why it's a real mistake:** the navigator's message said in plain words
that work would start when the navigator said so. Answering a clarifying
question isn't approval to build, and permission to skip the PR step for
one area doesn't decide *whether* to start work. The refactor also widened
the scope of an approved area on the driver's own initiative, without
raising it as a choice. That's the same pattern CLAUDE.md already warns
against ("escalate only when something would change scope").

**Cost:** two interruptions, a round of cleanup on published issues, an
unrequested local commit and uncommitted tests left for the navigator to
decide the fate of, and lost trust in letting the session run unattended.

It then happened again on the same topic. Asked to "log the behavior
mistake here and propose a solution moving forward," the driver wrote the
proposed solution into this entry, opened PR #62 with it, and pushed a
second commit revising it, all before discussing it with the navigator. The
navigator meant for the proposal to be talked through in chat first, with
no files touched until after that discussion.

**What changes:** agreed between navigator and driver in chat on
2026-10-15, then added to CLAUDE.md's operating rules:

1. **Every stage ends with a report, and the driver stops there.** The next
   stage starts only when the navigator says so, unless the navigator
   explicitly says to work through several stages together. Answers to
   questions and permissions about *how* to do something are not a go.
2. **"Propose" and "discuss" mean chat.** A proposal, plan, or
   recommendation stays in the conversation until the navigator approves
   it. It doesn't go into a file, issue, commit, or PR before that.
3. **Questions stay in chat.** Issues and docs record only what has been
   decided.
4. **Groundwork is part of the ask.** If approved work needs a refactor,
   new scaffolding, or a dependency first, name it and get it approved. A
   repo rule (such as "tests before fixes") is not approval to do it.
5. **These live in CLAUDE.md**, which loads at the start of every session.
   Session memory alone didn't hold: the same mistake recurred twice within
   one session even after it had been saved.

## 2026-10-15 — Driver changed an agreed design during implementation

**What happened:** For the Power Gauge ring gradients (#57), the driver
proposed in chat that each gradient run "along each arc, starting at 12
o'clock and finishing at the tip of the fill, so the brightest color always
sits at the leading edge." The same message added: "a fuller ring reaches
deeper into the vivid end." The navigator approved the idea. The two
sentences describe different designs. The first spans the full gradient
across whatever arc is visible. The second maps color across the ring's
whole 0–100% scale, so a short arc shows only the soft start of the
gradient. The driver didn't notice the conflict, and wrote both into the
issue.

During implementation, with the navigator's go to work through the whole
set of issues, the driver hit that conflict and resolved it alone, choosing
full-scale mapping. The choice was mentioned only in passing, in a
mid-work status line, and later under "things I decided on my own" in the
final report, after it had already shipped to `main` and the live page. The
navigator's first look at the result: the gradients were "too minimal - can
barely see a color." Full-scale mapping was a large part of why, since most
real readings fill only part of a ring.

**Why it's a real mistake:** where a gradient runs is a visible design
choice, not an implementation detail. The navigator had approved a specific
design in plain words, and only the navigator could settle a conflict
between it and the driver's own add-on sentence. The driver applied "make
implementation decisions independently" to something that wasn't one.
Mentioning a decision in a progress note, or listing it after shipping,
isn't the same as asking before acting. The underlying error happened
earlier: the driver presented a proposal containing two incompatible
designs and didn't check it for consistency before asking for approval.

**Cost:** a shipped design the navigator didn't agree to, on the live page;
a fix-and-redeploy round (`c3e0259`); and a second process breakdown in one
day on the same theme of acting without the navigator's OK.

**What changes:** to be agreed with the navigator in chat, then recorded
here.

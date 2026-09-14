# Mistakes Log

Not a blame file. A record of where an agent session's process broke down —
time wasted, back-and-forth that shouldn't have been needed, or work that
became fatiguing to push through — so the pattern gets fixed instead of
repeated. Entries are dated, describe what happened plainly, and end with
what changes as a result.

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

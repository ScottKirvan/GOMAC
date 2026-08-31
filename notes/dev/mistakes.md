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
- **Reused a phrase the user had already claimed for something else.**
  Called the new HA `media_player` entity "the real media_player entity"
  to distinguish it from older native entities — colliding with Scott's own
  reserved term "the real media player" (the not-yet-built Android app).
  *What changes:* don't attach "real" or similar loaded qualifiers to a
  technical term without checking the user isn't already using that word
  for something else.
- **Kept superseded spec content annotated as history instead of deleting
  it.** After a plan changed, the old plan was kept in the spec marked
  "(superseded — see below)" rather than removed. Scott: "delete the parts
  of the spec that are no longer relevant - a historic record isn't
  necessary." *What changes:* delete replaced spec/plan content outright
  when a decision changes; git history is the record, not the doc.
- **Marked a PR as draft without being asked.** Required an explicit
  correction ("don't use that draft flag"). *What changes:* never set
  draft status unless asked to.

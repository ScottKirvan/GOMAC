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

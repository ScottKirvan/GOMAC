// Overridden at deploy time for cross-origin deployments (e.g. GitHub
// Pages / scottkirvan.com, which can't reach a relative /snapshot.json
// on TheFlea). When both are unset, the frontend just calls
// /snapshot.json on its own origin, which is what running this Node
// server locally or directly on TheFlea (either port) does.
//
// Two candidates rather than one: app.js tries PRIVATE first (short
// timeout) and falls back to PUBLIC if that's unreachable -- so the same
// public page serves the full snapshot, position included, to anyone
// actually on the tailnet, and the safe position-redacted one (see
// dashboardState.redactPositionForPublic) to everyone else, with only
// one URL for anyone to remember or bookmark.
//
// PRIVATE is TheFlea's tailnet-only port (tailscale serve) -- no port
// restriction, unreachable at all from outside the tailnet. PUBLIC is
// the Funnel port; Funnel only supports 443, 8443, or 10000 as its
// public-facing port (confirmed against Tailscale's own docs after an
// earlier attempt on :8090 silently failed for real external clients --
// testing from TheFlea itself gave a false pass, since local/tailnet DNS
// resolves the hostname to the private tailnet IP, bypassing the public
// relay's port restriction entirely; verified for real by forcing a
// connection through the actual public relay IP via `curl --resolve`).
window.GOMAC_API_BASE_PRIVATE = window.GOMAC_API_BASE_PRIVATE || "https://theflea.tail6388a4.ts.net:8091";
window.GOMAC_API_BASE_PUBLIC = window.GOMAC_API_BASE_PUBLIC || "https://theflea.tail6388a4.ts.net:8443";

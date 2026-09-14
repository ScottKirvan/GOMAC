// Overridden at deploy time for cross-origin deployments (e.g. GitHub
// Pages, which can't reach a relative /snapshot.json on TheFlea). When
// unset, the frontend just calls /snapshot.json on its own origin, which
// is what running this Node server locally or on TheFlea does.
//
// This is TheFlea's *public* port (tailscale funnel), which serves the
// position-redacted snapshot only -- see dashboardState.redactPositionForPublic.
// Position/GPS is deliberately not available here; it's served on a
// separate tailnet-only port (tailscale serve) instead, not reachable
// from the public internet at all.
window.GOMAC_API_BASE = window.GOMAC_API_BASE || "https://theflea.tail6388a4.ts.net:8090";

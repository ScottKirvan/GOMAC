// Overridden at deploy time for cross-origin deployments (e.g. GitHub
// Pages, which can't reach a relative /snapshot.json on TheFlea). When
// unset, the frontend just calls /snapshot.json on its own origin, which
// is what running this Node server locally or on TheFlea does.
//
// This is TheFlea's *public* Funnel port, proxying to the app's actual
// 8090 listener behind it. Tailscale Funnel only supports 443, 8443, or
// 10000 as its public-facing port (confirmed against Tailscale's own
// docs after 8090 silently failed for real external clients -- testing
// this from TheFlea itself gave a false pass, since local/tailnet DNS
// resolves the hostname to the private tailnet IP, bypassing the public
// relay's port restriction entirely; verified for real by forcing a
// connection through the actual public relay IP via `curl --resolve`).
// Serves the position-redacted snapshot only -- see
// dashboardState.redactPositionForPublic. Position/GPS is deliberately
// not available here; it's served on a separate tailnet-only port
// (tailscale serve, :8091) instead, not reachable from the public
// internet at all.
window.GOMAC_API_BASE = window.GOMAC_API_BASE || "https://theflea.tail6388a4.ts.net:8443";

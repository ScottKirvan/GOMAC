// Overridden at deploy time for cross-origin deployments (e.g. GitHub
// Pages, which can't reach a relative /snapshot.json on TheFlea). When
// unset, the frontend just calls /snapshot.json on its own origin, which
// is what running this Node server locally or on TheFlea does.
window.GOMAC_API_BASE = window.GOMAC_API_BASE || "";

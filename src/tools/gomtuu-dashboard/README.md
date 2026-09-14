# GOMAC Dashboard

A small web dashboard for Gomtuu's live telemetry: subscribes to Mosquitto,
polls Open-Meteo, and serves a plain JSON snapshot (`GET /snapshot.json`)
that the static frontend polls every 10s and re-renders. Deliberately not a
live push (no WebSocket) — this is a one-way read-only viewer, not
bidirectional, so plain HTTP polling is enough and there's nothing a
persistent connection buys here. Something still has to hold the live MQTT
connection (that's inherent to MQTT, not a choice), so this remains a small
Node process, not something GitHub Pages could serve on its own end to end.

Not a bridge daemon in the `src/integrations/<adapter>/` sense (it doesn't
publish anything or expose Home Assistant MQTT discovery) — it's a
read-only consumer of what those adapters already publish, so it lives
under `src/tools/` instead.

## Running it

```
npm install
npm run dev       # tsx, reads MQTT_HOST/MQTT_PORT/HTTP_PORT from env, defaults to 127.0.0.1:1883 / :8090
```

Mosquitto on TheFlea is currently bound to `127.0.0.1` only (see
`notes/dev/compute-hub-current-state.md`), so this only sees real data when
it's actually running on TheFlea itself. Locally it'll start fine and show
empty state until it can reach a broker with real traffic.

## What's actually live vs. not

| Panel | Status | Source |
|---|---|---|
| Power Gauge (SOC, voltage, current, solar) | **live** | `victron-ble/<mac>/<metric>` |
| Solar vs. battery power trend | **live** | same, sampled into an in-memory ring buffer as readings come in |
| All-sensors tables | **live** | same, one table per device MAC, every metric it publishes |
| Now Playing | **live** | `gomac/pandora/state/<metric>` (verified against `src/integrations/pianobar/src/telemetry.ts`) |
| Position (speed, heading, coords) | **live** | `gps/phone/<metric>` (phone GPS, rides HA's MQTT connection) |
| Connectivity (ping success, RTT) | **live** | `ping-monitor/<target>/<metric>`, sampled into an in-memory ring buffer |
| Weather & Sun | **live** | Open-Meteo, polled against the live `gps/phone` coordinates |

Every panel is live now. Position and Connectivity were confirmed live by
the IT-side agent handling TheFlea; Weather uses Open-Meteo (Scott's call
over HA's `weather.home` — see below for why) polled every 15 minutes by
default (`WEATHER_POLL_INTERVAL_MS`) whenever a GPS fix is known.

## Open questions / known caveats

1. **Why Open-Meteo over `weather.home`**: HA's weather entity would need
   a long-lived access token and is only as accurate as whatever location
   it actually tracks — worth confirming separately whether it follows a
   moving `device_tracker` or just a static home zone. Open-Meteo called
   directly against live GPS needs no HA dependency and is guaranteed to
   track Gomtuu's real position, so that's what's wired up. Revisit if
   Scott wants HA-integration parity (e.g. showing the same forecast HA's
   own dashboards use) badly enough to deal with the token.
2. **Open-Meteo's sunrise/sunset times are naive local-time strings for the
   queried location** (`timezone=auto`); the browser parses them in ITS
   OWN timezone, so the daylight bar drifts if the dashboard is viewed from
   a different timezone than Gomtuu is currently in. Fine for the common
   case (same person, near the van); not fixed with extra timezone
   handling yet.
3. **Field names for `gps/phone/#` and `ping-monitor/#` are per the IT
   agent's report, not independently re-verified against the live broker
   from this repo** — same posture as the Victron metric names below.
   `ping-monitor`'s `success` payload encoding in particular wasn't
   specified, so `src/connectivityState.ts` parses it leniently (numeric
   non-zero, or "true"/"1"/"up"/"ok") rather than assuming one exact
   string. Worth a `mosquitto_sub -h 127.0.0.1 -t 'gps/phone/#' -v` /
   `-t 'ping-monitor/#' -v` check before relying on these for anything
   real.

## Victron metric names are a best-effort guess, not verified

`notes/dev/compute-hub-current-state.md` confirms the topic shape
(`victron-ble/<mac>/<metric>`) but not a full field list — only one example
HA entity name. `src/victronState.ts` matches metric names by keyword
(`soc`, `voltage`, `current`, `power`, `solar_power`, etc.) rather than
hardcoding exact strings, specifically so the Power Gauge widget degrades
gracefully instead of silently being wrong if a guess is off. The raw
per-device sensor tables show every metric regardless of whether the
Power Gauge recognized it, so nothing is hidden either way.

**Before relying on the Power Gauge for anything real**, verify the actual
metric names against the live broker:

```
mosquitto_sub -h 127.0.0.1 -t 'victron-ble/#' -v
```

and adjust the patterns in `src/victronState.ts` if they don't match.

## Deployment

Not deployed anywhere yet. Per `notes/dev/compute-hub-current-state.md`'s
domain-separation model, getting this onto TheFlea (systemd unit, etc.) is
a deliberate, narrow deployment step outside this repo's own session — not
something to do from here without that being the explicit task. It also
genuinely can't be deployed from a GOMAC Claude Code Remote session
directly — no network path to TheFlea exists from that sandbox (no SSH, no
Tailscale, `theflea` doesn't resolve).

**GitHub Pages hosts the frontend now** — `docs/public/dashboard` is a
symlink to this package's `public/` directory, so the existing docs build
(`docs.yml`, unchanged) picks it up automatically and publishes it at
`https://scottkirvan.github.io/GOMAC/dashboard/`. That page is 100% static
files; it still needs a live copy of this Node process to actually have
data to show, reachable from the public internet since Pages is public.

To wire it up for real:

1. **This process still has to run somewhere that can reach Mosquitto** —
   that's TheFlea, same requirement as always. See the "not deployed
   anywhere yet" note above; this session has no path to do that step.
2. **Expose it publicly.** [Tailscale Funnel](https://tailscale.com/kb/1223/funnel)
   is the natural fit here (Tailscale's already on the project's roadmap) —
   it gives one local port a real public HTTPS URL without opening up
   anything else on TheFlea's network. Something like:
   ```
   tailscale funnel --bg 8090
   ```
   run on TheFlea, once this service is running there on port 8090 (or
   whatever `HTTP_PORT` is set to).
3. **Point the deployed page at that URL.** Edit
   `src/tools/gomtuu-dashboard/public/config.js` (which the symlink also
   carries into the docs build) to set:
   ```js
   window.GOMAC_API_BASE = "https://<the-funnel-url>";
   ```
   and push to `main` — the existing `docs.yml` workflow redeploys on any
   push under `docs/**`, which the symlinked dashboard files count as.

Until step 2 happens, the Pages copy renders fine but shows "unreachable"
— it has nothing to poll yet, which is the honest state, not a bug.

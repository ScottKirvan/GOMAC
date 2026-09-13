# GOMAC Dashboard

A small web dashboard for Gomtuu's live telemetry: subscribes to Mosquitto,
serves a browser UI over HTTP + WebSocket. Not a bridge daemon in the
`src/integrations/<adapter>/` sense (it doesn't publish anything or expose
Home Assistant MQTT discovery) — it's a read-only consumer of what those
adapters already publish, so it lives under `src/tools/` instead.

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
| Weather & Sun | **not wired** | see Open Questions |

Position and Connectivity were confirmed live by the IT-side agent handling
TheFlea (see Open Questions below for the one field-name caveat on each).
Weather still renders the reason it's unwired rather than fabricated
numbers — the whole point of moving past the mockup stage was to stop
showing sample data as if it were real.

## Open questions

1. **Weather** — no provider decided yet. Two live options now that GPS is
   real: reuse Home Assistant's `weather.home` entity (read via HA's
   REST/WebSocket API, needs a long-lived access token; only as accurate as
   whatever location that entity actually tracks — worth checking it moves
   with Gomtuu's GPS and isn't just a static home zone), or call Open-Meteo
   directly against the live `gps/phone/latitude,longitude` coordinates
   (free, no key, no HA dependency, and guaranteed to follow the van's real
   position). Scott's call.
2. **Field names for `gps/phone/#` and `ping-monitor/#` are per the IT
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
something to do from here without that being the explicit task.

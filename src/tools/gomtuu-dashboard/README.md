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
| Position | **not wired** | see Open Questions |
| Weather & Sun | **not wired** | see Open Questions |
| Connectivity | **not wired** | see Open Questions |

The three unwired panels render the reason they're unwired rather than
fabricated numbers — the whole point of moving past the mockup stage was
to stop showing sample data as if it were real.

## Open questions (blocking the three unwired panels)

1. **Position.** The phone GPS → HA home-location pipeline mentioned when
   this was scoped isn't in `notes/dev/compute-hub-current-state.md` yet,
   and GPS sourcing is still listed as an open item in
   `gomac-project-overview.md`. Needs an answer on: is it live now, and if
   so is it an HA `device_tracker`/`person` entity (read via HA's REST/WebSocket
   API, needing a long-lived access token) or has it been bridged onto MQTT
   the way Victron/pianobar are?
2. **Weather.** No provider is wired up anywhere yet. Needs a provider
   choice — Open-Meteo (free, no key) would need nothing from Scott; a
   commercial provider would need an existing account/key.
3. **Connectivity.** `ping-monitor` writes to `/var/log/ping-monitor/ping.csv`
   on TheFlea, not MQTT. Either this service needs direct file access to that
   path (implies running on TheFlea with read access to that log), or
   `ping-monitor` needs a small addition to publish onto MQTT the way the
   other adapters do.

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

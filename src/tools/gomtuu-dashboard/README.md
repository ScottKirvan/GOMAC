# GOMAC Dashboard

A small web dashboard for Gomtuu's live telemetry: subscribes to Mosquitto,
polls Open-Meteo, and serves a plain JSON snapshot (`GET /snapshot.json`)
that the static frontend polls every 10s and re-renders. The fast-changing
readings (battery current, solar power, voltage, GPS speed and heading) also
stream live over Server-Sent Events (`GET /stream`, see "Live stream"
below), a one-way push. There's no WebSocket: the viewer is read-only, so
nothing needs to travel back to the server. Something still has to hold the live MQTT
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
| Power Gauge (Ah remaining, voltage, solar, amp flow, charger) | **live** | `victron-ble/<mac>/<metric>` |
| Amp gauge (bidirectional draw/charge ring) | **live** | `power.current`, surfaced live as the dial center's `ampReading` line and the stats column's Current row -- no new plumbing, just a visualization of a field the backend already summarized. Outermost of the Power Gauge dial's three concentric rings (amp outer, SOC middle, solar inner, all sharing one center). 0A at top dead center, charge fills clockwise (green), draw fills counter-clockwise (red), full ring = `AMP_GAUGE_FULL_SCALE_A` in `public/app.js` (currently ±30A, tune there). All three rings are gradient arcs: each ring's soft-to-vivid color pair is derived from its base color in `style.css` by `gradientPair` in `public/color.js`, whose tuning constants are at the top of that file. |
| SOC ring center readout (Ah remaining) | **live** | `power.consumedAh` (BMV-712's `consumed_ah`, newly captured in `victronState.ts`) against a `BATTERY_CAPACITY_AH` (200Ah) nominal pack assumption in `public/app.js` -- deliberately not derived from `soc`%, since the two don't necessarily agree (the BMV-712's own internally configured capacity setting may differ from 200Ah). Falls back to a soc%-derived estimate, flagged as such in the number's tooltip, only if `consumed_ah` itself isn't being reported. The ring's fill is unchanged and still driven by `soc`% directly. |
| Solar vs. battery power trend | **live** | same, merged into 10-second buckets. 48 hours are kept and saved to `POWER_HISTORY_STATE_FILE` (default `data/power-history.json`, relative to the working directory, gitignored) every minute and on shutdown, so restarts don't blank the chart. Battery power is voltage × current, since the BMV-712 shunt doesn't report power itself. Each bucket also records the energy charged into the battery during it (`chargedWh`, charging only), counted between consecutive shunt readings no more than 60s apart. |
| All-sensors tables | **live** | same, one table per device MAC, every metric it publishes |
| Now Playing | **live** | `gomac/pandora/state/<metric>` (verified against `src/integrations/pianobar/src/telemetry.ts`) |
| Position (speed, heading, coords) | **live** | `gps/phone/<metric>` (phone GPS, rides HA's MQTT connection) |
| Connectivity (ping success, RTT) | **live** | `ping-monitor/<target>/<metric>`, sampled into an in-memory ring buffer |
| Weather & Sun (conditions, wind, 4-day forecast) | **live** | Open-Meteo, polled against the live `gps/phone` coordinates |

Every panel is live now. Position and Connectivity were confirmed live by
the IT-side agent handling TheFlea; Weather uses Open-Meteo (Scott's call
over HA's `weather.home` — see below for why) polled every 15 minutes by
default (`WEATHER_POLL_INTERVAL_MS`) once a GPS fix is known. After a
restart, the first fetch happens within about 10 seconds of the first
fix. When a fetch fails (for example, no internet), it retries after 1,
2, 4, 8, then 15 minutes, and the panel keeps the last good weather with
its age. The journal logs only when fetching starts failing and when it
recovers.

## Live stream

`GET /stream` on both ports is a Server-Sent Events stream of `live` events,
whose `data` is JSON:

```json
{ "v": 1, "t": 1792243397203,
  "power": { "current": -4.3, "solarPower": 59, "voltage": 13.29 },
  "position": { "latitude": 44.37, "longitude": -64.32, "speedMps": 5.4, "courseDeg": 271 } }
```

- `v` is the format version, bumped on any incompatible change. Consumers
  should ignore fields they don't know. Missing values are omitted.
- `t` is the server time the event was sent, in ms since the epoch. The
  page's header clock shows the newest `t` or snapshot `serverTime` it has
  received, so it updates as often as any data does.
- On the public port, `position` is approximate: coordinates rounded to 1
  decimal place (about 11 km), speed and heading to whole numbers, and
  `"coarse": true`. `/snapshot.json` on that port uses the same rounding.
- Values are sampled at up to `LIVE_STREAM_HZ` times a second (default 4)
  and sent only when something changed. A new connection gets the current
  values right away. Keep-alive comments go out every 15s.
- Each port accepts up to `LIVE_STREAM_MAX_CLIENTS` streams (default 20).
  Past that it answers 503, and those viewers keep updating by polling.
- The frontend opens the stream after its first snapshot, eases the live
  values smoothly between updates, and closes the stream while the page
  isn't visible, to save the van's uplink. Polling continues throughout, so
  if the stream drops or is refused, the page still updates every 10s. The
  header badge reads "live · streaming" while the stream is connected.

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
3. **The solar dial and trend chart scale to the all-time peak solar
   reading.** `src/solarPeak.ts` keeps the highest solar power ever seen
   and sends it as `victron.solarPeak` (`watts`, `at`) in `/snapshot.json`.
   The solar ring fills relative to it, the trend chart's top is pinned to
   it so the scale stays stable, and the solar watts reading in the dial
   center shows it as a tooltip.
   It's saved whenever a new peak is set to `SOLAR_PEAK_STATE_FILE`
   (default `data/solar-peak.json`, relative to the working directory,
   gitignored), so restarts don't reset it. To seed it from older logs,
   write `{"watts": <W>}` to that file before starting the server.

4. **Field names for `gps/phone/#` and `ping-monitor/#` are per the IT
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

**Device names:** `victron-ble/<mac>/name` (retained) is reserved for the
device's own BLE advertised name: the custom name set in VictronConnect,
or its factory default (model + serial). It's shown in place of the MAC in
the sensor table headers and the Power Gauge header, and never as a
metric. Until that topic is published, the dashboard falls back to MACs.

**Before relying on the Power Gauge for anything real**, verify the actual
metric names against the live broker:

```
mosquitto_sub -h 127.0.0.1 -t 'victron-ble/#' -v
```

and adjust the patterns in `src/victronState.ts` if they don't match.

## Deployment

Two halves, deployed separately:

### Backend (Node server) — TheFlea

Runs as `gomac-dashboard.service` (system unit, `User=scott`) from a
dedicated checkout at `/home/scott/gomac-deploy`, working directory
`src/tools/gomtuu-dashboard`, with MQTT credentials from
`/etc/gomac-dashboard/env`. Two ports, both bound to `127.0.0.1` and
published by Tailscale:

| Port | Snapshot | Published as |
|---|---|---|
| `8090` (`HTTP_PORT`) | approximate position (coordinates to 1 decimal place, about 11 km) | `tailscale funnel` → `https://theflea.tail6388a4.ts.net:8443` (public) |
| `8091` (`HTTP_PRIVATE_PORT`) | full, incl. position | `tailscale serve` → `https://theflea.tail6388a4.ts.net:8091` (tailnet only) |

To deploy a merged change (on TheFlea):

```sh
cd /home/scott/gomac-deploy
git fetch origin && git switch --detach origin/main
cd src/tools/gomtuu-dashboard && npm ci && npm run build && npm test
sudo systemctl restart gomac-dashboard
```

Keep `/home/scott/gomac-deploy` on `main`; do feature work in a separate
worktree, since this checkout is what production runs from.
`data/solar-peak.json` (gitignored) holds the persisted all-time solar
peak. The server writes it on each new peak, so to hand-edit it, stop the
service first.

This can't be done from a GOMAC Claude Code Remote (cloud) session: that
sandbox has no network path to TheFlea.

### Frontend (static files) — GitHub Pages

`docs/public/dashboard` is a symlink to this package's `public/`
directory, so the docs build (`docs.yml`) publishes it at
`https://www.scottkirvan.com/GOMAC/dashboard/`. `public/config.js` points
it at the backend: `GOMAC_API_BASE_PRIVATE` (the tailnet URL, tried first
with a short timeout) and `GOMAC_API_BASE_PUBLIC` (the Funnel URL,
fallback for visitors off the tailnet). When both are unset, the page
fetches `/snapshot.json` from its own origin.

`docs.yml` redeploys on pushes to `main` touching `docs/**` or
`src/tools/gomtuu-dashboard/public/**`. The second path is required: git
tracks `docs/public/dashboard` as a symlink, so edits to the files it
points at never match `docs/**` on their own (this left Pages stuck on a
2026-09-14 build until the path was added). It can also be run by hand:
`gh workflow run docs.yml --ref main`.

**Previewing a branch locally:** the committed `config.js` sends the page
to the *production* backend, so a preview server on other ports would
show new frontend code against production data. In the preview checkout,
blank `public/config.js` (so it fetches same-origin) and keep that change
out of commits, e.g. with `git update-index --skip-worktree
public/config.js`.

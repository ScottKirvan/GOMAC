# Data Sources

A reference for every telemetry source GOMAC currently uses (or has readily
available): how the data arrives, how often it actually updates, and
whether it's something that's always available or depends on something
else being active (an app running, a specific network, etc.).

"Push" means the source publishes to MQTT on its own schedule and GOMAC
just listens. "Poll" means GOMAC's own code actively requests the data on
an interval it controls.

| Source | Provides | Delivery | Update frequency | Always on? |
|---|---|---|---|---|
| **Victron BLE** (`victron-ble-monitor.py`) | Battery SOC/voltage/current/temp, solar panel voltage/power, charger state, yield | Push — MQTT, topic `victron-ble/<mac>/<metric>` | Every 1 minute (systemd timer) | Yes, as long as TheFlea is powered and the Victron gear stays in BLE range — no phone or app dependency |
| **Pandora / pianobar** (Now Playing) | Title, artist, album, station, rating, cover art, song progress | Push — MQTT, topic `gomac/pandora/state/<metric>`, retained | Event-driven — fires on song start/finish/love/ban/station change, not on a timer. Typically every few minutes (song length), or instantly on user action | No — only reflects reality while pianobar is actually running and playing. Retained messages mean the last value sticks around even when stale, with nothing in the topic itself flagging that |
| **Position** (phone GPS) | Latitude, longitude, accuracy, altitude, speed, heading | Push — MQTT, topic `gps/phone/<metric>`, retained | Event-driven, controlled entirely by the phone app's own reporting behavior — not something GOMAC sets or knows precisely | **No** — this is a phone app, not fixed hardware. Depends on the app running, the phone having signal, and the phone actually being with the van. No update = stale retained value, same caveat as Now Playing |
| **Connectivity** (`ping-monitor`) | Ping success/RTT to 8.8.8.8, 1.1.1.1, and the gateway | Push — MQTT, topic `ping-monitor/<target>/<metric>`, retained | Every 1 minute (existing systemd timer, predates GOMAC) | Yes — runs as long as TheFlea itself is up, no phone or app dependency. Reflects TheFlea's own connectivity, not Gomtuu's Starlink dish specifically |
| **Starlink dish stats** | Signal quality, throughput, obstruction, uptime | None yet — reachable via the dish's local gRPC API (`192.168.100.1:9200`) but not logged or polled by anything persistent today | N/A (ad hoc queries only so far) | Only when TheFlea is connected to the Starlink-provided WiFi specifically. **GPS is not available this way** — Starlink removed it from this API in May 2026 |
| **Weather & Sun** (Open-Meteo) | Current temp/conditions, sunrise/sunset | Poll — GOMAC's dashboard service calls Open-Meteo directly against the live GPS coordinates | Every 15 minutes by default (configurable; free tier allows up to 10,000 calls/day, so this could poll far more often if ever useful) | Depends on a live GPS fix existing to know *where* to ask about — skipped entirely if position is unknown |

## Notes

- **None of the MQTT field names above are independently verified against
  the live broker from the GOMAC repo itself** — they're documented as
  reported by whoever set up each bridge. Before building something new
  against any of these, it's worth a quick sanity check on TheFlea:
  ```
  mosquitto_sub -h 127.0.0.1 -t '<topic>/#' -v
  ```
- "Retained" MQTT messages (Pandora, Position, Connectivity) mean a
  subscriber always gets *something* immediately on connect, even if it's
  hours old. Freshness has to be judged by a timestamp on the data itself,
  not by the mere presence of a value.
- Polling intervals for anything GOMAC controls (currently just weather)
  are a design choice, not a hard limit — see
  `src/tools/gomtuu-dashboard/src/config.ts` for what's actually
  configurable today.

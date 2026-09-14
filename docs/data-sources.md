# Data Sources

| Source | Provides | Delivery | Frequency | Always on |
|---|---|---|---|---|
| Victron BLE | Battery, solar | Push (MQTT) | 1 min | Yes |
| Pandora / pianobar | Now playing | Push (MQTT) | Event | No — playback only |
| Position (phone GPS) | Location, speed, heading | Push (MQTT) | Event | No — phone app |
| Connectivity (ping-monitor) | Ping success, RTT | Push (MQTT) | 1 min | Yes |
| Starlink dish | Signal, throughput | None (ad hoc) | N/A | No — dish WiFi only |
| Weather & Sun (Open-Meteo) | Temp, sunrise/sunset | Poll | 15 min | No — needs GPS fix |

**Push** = source publishes to MQTT on its own. **Poll** = GOMAC requests it on an interval.

## Caveats

- MQTT field names not independently verified — check with `mosquitto_sub -h 127.0.0.1 -t '<topic>/#' -v` before relying on one.
- Retained topics (Pandora, Position, Connectivity) return a last-known value even when stale — no freshness flag built in.
- Starlink GPS: unavailable via the local API since May 2026.
- Weather poll interval is configurable in `src/tools/gomtuu-dashboard/src/config.ts`.

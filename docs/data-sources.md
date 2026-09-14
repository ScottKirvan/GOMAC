# Data Sources

| Source | Frequency | Always on |
|---|---|---|
| Victron BLE | 1 min | Yes |
| Pandora / pianobar | Event | No — playback only |
| Position (phone GPS) | Event | No — phone app |
| Connectivity (ping-monitor) | 1 min | Yes |
| Starlink dish | N/A | No — dish WiFi only |
| Weather & Sun (Open-Meteo) | 15 min | No — needs GPS fix |

## Caveats

- MQTT field names not independently verified — check with `mosquitto_sub -h 127.0.0.1 -t '<topic>/#' -v` before relying on one.
- Retained topics (Pandora, Position, Connectivity) return a last-known value even when stale — no freshness flag built in.
- Starlink GPS: unavailable via the local API since May 2026.
- Weather poll interval is configurable in `src/tools/gomtuu-dashboard/src/config.ts`.

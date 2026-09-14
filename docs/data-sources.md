# Data Sources

| Source | Field | Frequency | Always on |
|---|---|---|---|
| Victron BLE | State of charge (BMV-712) | 1 min | Yes |
| Victron BLE | Battery voltage (BMV-712) | 1 min | Yes |
| Victron BLE | Battery current (BMV-712) | 1 min | Yes |
| Victron BLE | Consumed, Ah (BMV-712) | 1 min | Yes |
| Victron BLE | Remaining runtime (BMV-712) | 1 min | Yes |
| Victron BLE | Alarm state (BMV-712) | 1 min | Yes |
| Victron BLE | Solar power (MPPT) | 1 min | Yes |
| Victron BLE | Solar yield, today (MPPT) | 1 min | Yes |
| Victron BLE | Charger state (MPPT / Orion / AC charger) | 1 min | Yes |
| Victron BLE | Charger error (MPPT / Orion / AC charger) | 1 min | Yes |
| Victron BLE | DC-DC input/output voltage (Orion) | 1 min | Yes |
| Victron BLE | AC charger output voltage/current | 1 min | Yes |
| Pandora / pianobar | Title | Event | No — playback only |
| Pandora / pianobar | Artist | Event | No — playback only |
| Pandora / pianobar | Album | Event | No — playback only |
| Pandora / pianobar | Station | Event | No — playback only |
| Pandora / pianobar | Rating | Event | No — playback only |
| Pandora / pianobar | Cover art | Event | No — playback only |
| Pandora / pianobar | Song duration | Event | No — playback only |
| Pandora / pianobar | Song position | Event | No — playback only |
| Pandora / pianobar | Station list | Event | No — playback only |
| Position (phone GPS) | Latitude | Event | No — phone app |
| Position (phone GPS) | Longitude | Event | No — phone app |
| Position (phone GPS) | Accuracy | Event | No — phone app |
| Position (phone GPS) | Altitude | Event | No — phone app |
| Position (phone GPS) | Velocity | Event | No — phone app |
| Position (phone GPS) | Direction | Event | No — phone app |
| Connectivity (ping-monitor) | 8.8.8.8 RTT | 1 min | Yes |
| Connectivity (ping-monitor) | 8.8.8.8 success | 1 min | Yes |
| Connectivity (ping-monitor) | 1.1.1.1 RTT | 1 min | Yes |
| Connectivity (ping-monitor) | 1.1.1.1 success | 1 min | Yes |
| Connectivity (ping-monitor) | Gateway RTT | 1 min | Yes |
| Connectivity (ping-monitor) | Gateway success | 1 min | Yes |
| Starlink dish | Signal quality | N/A | No — dish WiFi only |
| Starlink dish | Throughput | N/A | No — dish WiFi only |
| Starlink dish | Obstruction | N/A | No — dish WiFi only |
| Starlink dish | Uptime | N/A | No — dish WiFi only |
| Weather & Sun (Open-Meteo) | Temperature | 15 min | No — needs GPS fix |
| Weather & Sun (Open-Meteo) | Feels-like temp | 15 min | No — needs GPS fix |
| Weather & Sun (Open-Meteo) | Conditions | 15 min | No — needs GPS fix |
| Weather & Sun (Open-Meteo) | Wind speed | 15 min | No — needs GPS fix |
| Weather & Sun (Open-Meteo) | Sunrise | 15 min | No — needs GPS fix |
| Weather & Sun (Open-Meteo) | Sunset | 15 min | No — needs GPS fix |

## Caveats

- The Victron BLE row above is directly verified against the live broker across all four devices (BMV-712 battery monitor, MPPT solar charger, Orion DC-DC charger, AC charger) -- not the ~16-field, HA-entity-registry-derived guess this used to say. There is no battery power or battery temperature field: the BMV-712 doesn't compute/publish power, and nothing in this setup has a temperature sensor. Re-check with `mosquitto_sub -h 127.0.0.1 -t 'victron-ble/#' -v` if a device is added or changed.
- MQTT field names elsewhere are as reported, not independently re-verified — same check applies: `mosquitto_sub -h 127.0.0.1 -t '<topic>/#' -v`.
- Retained topics (Pandora, Position, Connectivity) return a last-known value even when stale — no freshness flag built in.
- Starlink fields are known-available via the dish's local API but nothing currently logs or polls them.
- Starlink GPS: unavailable via the local API since May 2026.
- Weather poll interval is configurable in `src/tools/gomtuu-dashboard/src/config.ts`.

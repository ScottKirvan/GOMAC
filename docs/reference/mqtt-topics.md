# MQTT Topics

Broker: Mosquitto.

Root namespace: `gomac/<category>/<role>/...`

## Power

Source: a BLE collector decrypting Victron "Instant Readout" advertisements via the [`victron-ble`](https://github.com/keshavdv/victron-ble) library. One retained JSON message per device, published per scan pass.

Roles are named by function, not by vendor or model, so any device filling that role publishes to the same topic.

### Topics

| Topic | Role |
|---|---|
| `gomac/power/solar/state` | Solar charge controller (Victron MPPT series) |
| `gomac/power/dcdc/state` | DC-DC charger, e.g. alternator-fed (Victron Orion Smart series) |
| `gomac/power/shore/state` | AC/shore power charger (Victron Blue Smart series) |
| `gomac/power/bridge/status` | Collector availability: `online` / `offline` (LWT) |

### Payload

Retained JSON. Only fields the device reports are present — no fixed schema.

```json
{
  "timestamp": "2026-08-16T09:14:03-07:00",
  "charge_state": "BULK",
  "battery_voltage": 13.21,
  "battery_charging_current": 4.2,
  "yield_today": 860,
  "solar_power": 58,
  "external_device_load": 0.0
}
```

### Fields

#### `gomac/power/solar/state`

| Field | Unit | Notes |
|---|---|---|
| `charge_state` | — | `OperationMode` enum name |
| `charger_error` | — | `ChargerError` enum name |
| `battery_voltage` | V | |
| `battery_charging_current` | A | |
| `yield_today` | Wh | |
| `solar_power` | W | |
| `external_device_load` | A | |

#### `gomac/power/dcdc/state`

| Field | Unit | Notes |
|---|---|---|
| `charge_state` | — | `OperationMode` enum name |
| `charger_error` | — | `ChargerError` enum name |
| `input_voltage` | V | |
| `output_voltage` | V | |
| `off_reason` | — | `OffReason` enum name |

#### `gomac/power/shore/state`

| Field | Unit | Notes |
|---|---|---|
| `charge_state` | — | `OperationMode` enum name |
| `charger_error` | — | `ChargerError` enum name |
| `output_voltage1`, `output_voltage2`, `output_voltage3` | V | per AC leg |
| `output_current1`, `output_current2`, `output_current3` | A | per AC leg |
| `temperature` | °C | |
| `ac_current` | A | AC input current |

### Enums

`OperationMode`: `OFF`, `LOW_POWER`, `FAULT`, `BULK`, `ABSORPTION`, `FLOAT`, `STORAGE`, `EQUALIZE_MANUAL`, `INVERTING`, `POWER_SUPPLY`, `STARTING_UP`, `REPEATED_ABSORPTION`, `RECONDITION`, `BATTERY_SAFE`, `ACTIVE`, `EXTERNAL_CONTROL`, `NOT_AVAILABLE`

`ChargerError`: see the [`victron-ble`](https://github.com/keshavdv/victron-ble) library's `ChargerError` enum for the full code list.

`OffReason` (dcdc only): `NO_REASON`, `NO_INPUT_POWER`, `SWITCHED_OFF_SWITCH`, `SWITCHED_OFF_REGISTER`, `REMOTE_INPUT`, `PROTECTION_ACTIVE`, `LOAD_OUTPUT_DISABLED`, `PAY_AS_YOU_GO_OUT_OF_CREDIT`, `BMS`, `ENGINE_SHUTDOWN`, `ANALYSING_INPUT_VOLTAGE`

### Conventions

- Retain: yes, on all `state` and `status` topics
- QoS: 0
- `bridge/status`: LWT `offline`; publisher sets `online` retained on startup
- Missing reading for a device in a given scan pass: topic is not republished, prior retained value stands

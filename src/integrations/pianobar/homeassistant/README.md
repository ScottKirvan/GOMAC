# GOMAC Pandora (pianobar) — Home Assistant Integration

A Home Assistant custom integration providing a real `media_player` entity
for the pianobar MQTT bridge daemon (`src/integrations/pianobar/`), per the
"Media Player Entity" section of
`src/integrations/pianobar/notes/pandora-mqtt-spec.md`. It is a genuine
MQTT subscriber/publisher on the daemon's existing `gomac/pandora/*` topic
contract (`src/integrations/pianobar/src/telemetry.ts` and
`commandHandler.ts`) — no daemon changes, no new topics.

This is the first Python code in this repo. It lives colocated with the
daemon it pairs with, not in a generic top-level location, since it's
pianobar-specific rather than a generalized abstraction (see
`notes/dev/bridge-daemon-spec.md`'s "don't generalize before a second
instance" discipline).

## What it adds alongside the daemon's existing entities

The daemon (`haDiscovery.ts`) already publishes native MQTT-discovery
`sensor`/`image`/`button` entities for title/artist/album/station/rating,
cover art, and the love/ban/tired/restart/skip/play/pause/volume-nudge
actions. **This integration does not replace or duplicate any of that** —
`love`, `ban`, `tired`, and `restart` have no standard `MediaPlayerEntity`
concept and stay exactly as they are, as separate `button` entities.

What this integration adds is one real `media_player.pandora` entity,
mapping onto `MediaPlayerEntity`'s standard interface:

| `MediaPlayerEntity` surface | Daemon topic/action |
|---|---|
| `media_title` / `media_artist` / `media_album_name` | `gomac/pandora/state/{title,artist,album}` |
| `entity_picture` (via `media_image_url`) | `gomac/pandora/state/cover_art` (a URL, not raw bytes — see `telemetry.ts`'s doc comment) |
| `source` / `source_list` / `SELECT_SOURCE` | `gomac/pandora/state/{station,stations}`, `{"action": "select_source", "station": "..."}` |
| `volume_level` / `VOLUME_SET` | `gomac/pandora/state/volume`, `{"action": "volume_set", "volume": <0.0-1.0>}` — a plain linear passthrough, matching `commandHandler.ts`'s `handleVolumeSet` exactly. No curve is applied here, intentionally. |
| `async_media_play` / `async_media_pause` / `async_media_next_track` | `{"action": "play"}` / `{"action": "pause"}` / `{"action": "next"}` |

`PREVIOUS_TRACK` is deliberately never included in `supported_features` —
pianobar has no "previous track" keybinding at all (confirmed in
`pandora-mqtt-spec.md`'s Command Surface table), so this isn't a gap in the
entity, it's a real backend limitation.

It joins the **same HA device** the daemon's existing button/sensor
entities already use (`identifiers: ["gomac-pandora"]` in `haDiscovery.ts`),
so everything shows up under one "Pandora" device in HA — see "Why this
entity lands on the daemon's existing device" below for how.

## The playback-state gap

The daemon publishes **no explicit "is it playing vs. paused" telemetry** —
there is no dedicated state topic for it, and no daemon-side change is in
scope for this work. `media_player.py`'s module docstring documents the
derivation in full; summarized:

- Issuing play/pause/next **through this entity** sets `state`
  optimistically and immediately (before any telemetry confirms it).
- Otherwise, whenever the retained `state/title` topic's value *changes* —
  which can only happen on pianobar's `songstart`/`stationfetchplaylist`
  events (see `telemetry.ts`'s `EVENT_METRICS`) — `state` is set to
  `playing`, since both of those events mean pianobar just started playing
  something.

**Known, explicitly accepted limitation**: a playback change made through
any channel *other* than this entity — the Bluetooth AVRCP buttons via
`pianobar-mpris-bridge.py`, or a manual FIFO write — is invisible to this
heuristic. There is no telemetry event for "paused" at all, so a pause
triggered outside this entity leaves `state` reporting stale `playing`
until the next title change resets it. Closing this for real would need a
daemon-side telemetry addition, which is out of scope here.

## Why this entity lands on the daemon's existing device, not a second one

Home Assistant's own MQTT integration, when it processes the daemon's
discovery `device: {identifiers: ["gomac-pandora"], ...}` block, always
namespaces device identifiers under its own domain — confirmed directly
against HA core (`homeassistant/components/mqtt/entity.py`:
`identifiers={(DOMAIN, id_) for id_ in ...}`, where `DOMAIN` there is
`"mqtt"`, not the identity of whichever daemon published the discovery
config). So the device HA actually creates is keyed on
`("mqtt", "gomac-pandora")`, not on this integration's own domain
(`gomac_pandora`). `const.py`'s `MQTT_DEVICE_DOMAIN`/`MQTT_DEVICE_IDENTIFIER`
reuse that exact tuple in this entity's `device_info`, which is what makes
it join the existing device instead of creating a second one. This is
covered by `tests/test_media_player.py::test_entity_lands_on_the_daemons_existing_device`.

## Why a config-entry integration (not a legacy YAML platform)

A legacy `media_player` YAML platform entity cannot attach to a Device —
and therefore can't be assigned to a Room in HA's UI — even with
`device_info` set. This was confirmed directly in a separate, TheFlea-owned
ad hoc integration's own code comments (see `pandora-mqtt-spec.md`'s
"Lessons From the Ad Hoc TheFlea Integration"), and independently in HA
core's own `mqtt/const.py` (`media_player` is absent from
`SUPPORTED_COMPONENTS`, i.e. there is no native MQTT-discovery
`media_player` at all). `config_flow.py` exists purely to force a config
entry into being — it takes no real user input. `async_step_user` shows a
single confirmation form and, on submit, creates the entry; a singleton
guard (`async_set_unique_id` + `_abort_if_unique_id_configured`) makes sure
only one instance can ever be added, matching the same pattern the ad hoc
TheFlea integration already proved.

## Why Home Assistant's own `mqtt` integration, not a bundled MQTT client

This integration declares `"dependencies": ["mqtt"]` in its manifest and
talks MQTT entirely through `homeassistant.components.mqtt`'s public
`async_subscribe`/`async_publish` functions, rather than bundling
`paho-mqtt` (or similar) as its own client:

- It reuses the broker connection and credentials the user has already
  configured in HA — no separate credential to provision for this
  integration specifically.
- It runs entirely on HA's own asyncio event loop. The ad hoc TheFlea
  integration's bridge script had to explicitly marshal every D-Bus call
  onto the GLib main loop via `GLib.idle_add()` because `paho-mqtt` runs
  its callbacks on its own network thread, not the caller's — a real,
  previously-hit failure mode (see `pandora-mqtt-spec.md`). Using HA's own
  `mqtt` integration sidesteps that whole hazard class rather than having
  to work around it.
- It's the idiomatic way a Home Assistant custom integration talks MQTT.

## Configuration

**None.** The config flow (Settings → Devices & Services → Add Integration
→ "GOMAC Pandora (pianobar)") takes no fields — it just confirms and
creates the single entry. The entity assumes the daemon's **default** topic
names (`gomac/pandora/cmd`, `gomac/pandora/availability`,
`gomac/pandora/state/*` — see `const.py`). If a real deployment ever
overrides the daemon's `MQTT_COMMAND_TOPIC`/`MQTT_AVAILABILITY_TOPIC` env
vars from their defaults, `const.py`'s topic constants need updating to
match — this integration does not expose that as a config option, matching
the "no real user input" pattern above.

Requires Home Assistant's own `mqtt` integration to already be set up and
connected to the same broker the daemon publishes to. `async_setup_entry`
raises `ConfigEntryNotReady` (HA will retry) if the MQTT client isn't ready
yet — e.g. right after HA itself starts up.

## Deploying into a real Home Assistant instance

```sh
# From this directory (src/integrations/pianobar/homeassistant/):
cp -r custom_components/gomac_pandora /path/to/homeassistant/config/custom_components/
```

Then, on that Home Assistant instance:

1. Restart Home Assistant (custom integrations are only picked up on
   restart, not hot-reloaded).
2. Settings → Devices & Services → **Add Integration** → search
   "GOMAC Pandora (pianobar)" → confirm the single step.
3. The `media_player.pandora` entity should appear immediately, grouped
   under the existing "Pandora" device alongside the daemon's own
   button/sensor/image entities. It will read `unavailable` until the
   daemon's `gomac/pandora/availability` topic reports `online` (retained,
   so this is typically instant if the daemon is already running).

To update after a code change, repeat step 1 (copy the updated
`custom_components/gomac_pandora` directory over, restart HA) — no need to
remove and re-add the integration; HA reloads the existing config entry
against the new code on restart.

## Running the tests

Uses [`pytest-homeassistant-custom-component`](https://pypi.org/project/pytest-homeassistant-custom-component/),
the standard harness for testing custom HA integrations without a live HA
instance — it provides a real (but isolated) `hass` fixture plus an
`mqtt_mock` fixture that wraps HA's actual MQTT client code path in a
`MagicMock`, so tests exercise the real HA `mqtt` integration rather than a
hand-rolled stand-in.

```sh
cd src/integrations/pianobar/homeassistant
python3 -m venv .venv
.venv/bin/pip install -r requirements-test.txt
.venv/bin/python -m pytest
```

`pyproject.toml` sets `pythonpath = ["."]` so `custom_components.gomac_pandora`
resolves regardless of where `pytest` is invoked from within this
directory.

## Decisions worth flagging for review

- **Reused HA's own `mqtt` integration as the MQTT client**, rather than
  picking a standalone library (e.g. `paho-mqtt`) as the task description's
  open judgment call invited. See "Why Home Assistant's own `mqtt`
  integration" above for the full reasoning — flagging because it's a
  meaningfully different shape than "bundle an MQTT client," even though
  it's still a genuine subscriber/publisher on the same real topics.
- **`("mqtt", "gomac-pandora")` as this entity's device identifier**, not
  this integration's own domain. This only works because it's verified
  against HA core's actual MQTT-discovery device-creation code (see "Why
  this entity lands on the daemon's existing device" above) — it is not
  officially documented as a supported cross-integration pattern, though it
  is the same mechanism HA relies on internally whenever two integrations
  are meant to share one device. If HA's MQTT discovery internals ever
  change how they namespace `device.identifiers`, this would need
  revisiting.
- **Playback `state` is a documented heuristic, not real telemetry** — see
  "The playback-state gap" above. This was called out as an explicit,
  known-acceptable gap in the task rather than something to quietly paper
  over; `tests/test_media_player.py::test_pause_is_not_resurrected_by_a_repeated_title`
  pins down its exact boundary (a *repeated* title doesn't resurrect a
  user-issued pause; only a *changed* title does).
- **Volume optimistic-updates locally on `async_set_volume_level`**, rather
  than waiting for the daemon's retained `state/volume` echo before
  reflecting the new level in HA's UI. The daemon reports back whatever
  `wpctl` actually applied (clamped/rounded) a moment later on the same
  topic, which corrects this entity's displayed value if it differs — this
  mirrors the daemon's own "report reality, not intent" approach while
  keeping the HA volume slider responsive.
- **No config options for the daemon's topic names.** The daemon allows
  `MQTT_COMMAND_TOPIC`/`MQTT_AVAILABILITY_TOPIC` to be overridden via env
  vars; this integration hardcodes the defaults instead of exposing a
  config flow field for them, to keep the "no real user input" singleton
  pattern intact. Flagging in case a real deployment ever needs to run with
  non-default topic names.

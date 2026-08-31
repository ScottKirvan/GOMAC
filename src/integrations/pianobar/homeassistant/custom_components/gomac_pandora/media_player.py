"""media_player entity for the pianobar MQTT bridge daemon.

Reads/writes the same `gomac/pandora/cmd` and `gomac/pandora/state/*` topics
the daemon already publishes/subscribes (see
src/integrations/pianobar/src/telemetry.ts and
src/integrations/pianobar/src/commandHandler.ts) -- no daemon changes, no new
topics. Uses Home Assistant's own built-in `mqtt` integration
(`homeassistant.components.mqtt`) as the client rather than a bespoke third-
party MQTT library: it reuses the broker connection/credentials the user has
already configured in HA, runs entirely on HA's own event loop (sidestepping
the exact paho-mqtt-callback-thread hazard the ad hoc TheFlea integration's
D-Bus bridge had to work around with `GLib.idle_add`, see
notes/pandora-mqtt-spec.md), and is the idiomatic way a custom integration
talks MQTT in Home Assistant.

## The playback-state gap

The daemon publishes no explicit "is it playing vs. paused" telemetry --
there is no dedicated state topic for it (confirmed against telemetry.ts's
TELEMETRY_EVENTS / EVENT_METRICS; pianobar's own eventcmd fields don't carry
a play/pause flag either). Since no daemon-side change is in scope here, this
entity derives `state` heuristically instead:

- A command issued *through this entity* (play/pause/next) sets `state`
  optimistically and immediately, before any telemetry confirms it.
- Otherwise, whenever the retained `state/title` topic's value *changes*,
  that can only be `songstart` or `stationfetchplaylist` firing (see
  telemetry.ts's EVENT_METRICS) -- both mean pianobar just started playing
  something -- so `state` is set to `playing`.

**Known limitation, explicitly accepted rather than hidden**: playback
changes made through any channel other than this entity -- the Bluetooth
AVRCP buttons via `pianobar-mpris-bridge.py`, or a manual FIFO write --
are invisible to this heuristic. In particular there is no telemetry event
for "paused" at all, so a pause triggered outside this entity leaves
`state` reporting `playing` (stale) until the next title change resets it.
This is a real gap in what the daemon can currently report, not a bug in
this entity; closing it for real would require a daemon-side telemetry
change, which is out of scope for this work.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from homeassistant.components import mqtt
from homeassistant.components.media_player import (
    MediaPlayerEntity,
    MediaPlayerEntityFeature,
    MediaPlayerState,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import (
    ACTION_NEXT,
    ACTION_PAUSE,
    ACTION_PLAY,
    ACTION_SELECT_SOURCE,
    ACTION_VOLUME_SET,
    AVAILABILITY_ONLINE,
    AVAILABILITY_TOPIC,
    COMMAND_TOPIC,
    ENTITY_NAME,
    MQTT_DEVICE_DOMAIN,
    MQTT_DEVICE_IDENTIFIER,
    MQTT_QOS,
    TOPIC_ALBUM,
    TOPIC_ARTIST,
    TOPIC_COVER_ART,
    TOPIC_STATION,
    TOPIC_STATIONS,
    TOPIC_TITLE,
    TOPIC_VOLUME,
    UNIQUE_ID,
)

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the GOMAC Pandora media_player entity."""
    async_add_entities([GomacPandoraMediaPlayer()])


class GomacPandoraMediaPlayer(MediaPlayerEntity):
    """A real, config-entry-attached media_player for pianobar via MQTT."""

    _attr_has_entity_name = True
    _attr_name = None
    _attr_unique_id = UNIQUE_ID
    _attr_should_poll = False
    _attr_media_image_remotely_accessible = True
    _attr_supported_features = (
        MediaPlayerEntityFeature.PLAY
        | MediaPlayerEntityFeature.PAUSE
        | MediaPlayerEntityFeature.NEXT_TRACK
        | MediaPlayerEntityFeature.VOLUME_SET
        | MediaPlayerEntityFeature.SELECT_SOURCE
    )
    _attr_device_info = DeviceInfo(
        identifiers={(MQTT_DEVICE_DOMAIN, MQTT_DEVICE_IDENTIFIER)},
        name=ENTITY_NAME,
        manufacturer="GOMAC",
        model="pianobar bridge",
    )

    def __init__(self) -> None:
        """Start unavailable until the retained availability topic reports in."""
        self._attr_available = False
        self._unsubscribers: list[CALLBACK_TYPE] = []
        self._last_title: str | None = None

    async def async_added_to_hass(self) -> None:
        """Subscribe to every state topic this entity maps onto."""
        subscriptions = (
            (AVAILABILITY_TOPIC, self._availability_received),
            (TOPIC_TITLE, self._title_received),
            (TOPIC_ARTIST, self._artist_received),
            (TOPIC_ALBUM, self._album_received),
            (TOPIC_STATION, self._station_received),
            (TOPIC_COVER_ART, self._cover_art_received),
            (TOPIC_STATIONS, self._stations_received),
            (TOPIC_VOLUME, self._volume_received),
        )
        for topic, handler in subscriptions:
            self._unsubscribers.append(await mqtt.async_subscribe(self.hass, topic, handler, MQTT_QOS))

    async def async_will_remove_from_hass(self) -> None:
        """Tear down every subscription made in async_added_to_hass."""
        for unsubscribe in self._unsubscribers:
            unsubscribe()
        self._unsubscribers.clear()

    @callback
    def _availability_received(self, msg: mqtt.ReceiveMessage) -> None:
        self._attr_available = msg.payload == AVAILABILITY_ONLINE
        self.async_write_ha_state()

    @callback
    def _title_received(self, msg: mqtt.ReceiveMessage) -> None:
        title = msg.payload or None
        if title != self._last_title:
            # See the module docstring's "playback-state gap" section: a
            # changed title only happens on songstart/stationfetchplaylist,
            # both of which mean pianobar just started playing.
            self._attr_state = MediaPlayerState.PLAYING
        self._last_title = title
        self._attr_media_title = title
        self.async_write_ha_state()

    @callback
    def _artist_received(self, msg: mqtt.ReceiveMessage) -> None:
        self._attr_media_artist = msg.payload or None
        self.async_write_ha_state()

    @callback
    def _album_received(self, msg: mqtt.ReceiveMessage) -> None:
        self._attr_media_album_name = msg.payload or None
        self.async_write_ha_state()

    @callback
    def _station_received(self, msg: mqtt.ReceiveMessage) -> None:
        self._attr_source = msg.payload or None
        self.async_write_ha_state()

    @callback
    def _cover_art_received(self, msg: mqtt.ReceiveMessage) -> None:
        # coverArt is confirmed a URL string straight from Pandora's API
        # (telemetry.ts's doc comment), never raw image data -- so this maps
        # onto media_image_url with media_image_remotely_accessible=True,
        # the same way HA's own entity_picture property is documented to
        # link out directly rather than proxy/download.
        self._attr_media_image_url = msg.payload or None
        self.async_write_ha_state()

    @callback
    def _stations_received(self, msg: mqtt.ReceiveMessage) -> None:
        try:
            stations = json.loads(msg.payload)
        except (TypeError, ValueError):
            _LOGGER.warning("ignoring malformed stations payload on %s: %r", TOPIC_STATIONS, msg.payload)
            return
        if not isinstance(stations, list) or not all(isinstance(item, str) for item in stations):
            _LOGGER.warning("ignoring non-list-of-strings stations payload on %s: %r", TOPIC_STATIONS, msg.payload)
            return
        self._attr_source_list = stations
        self.async_write_ha_state()

    @callback
    def _volume_received(self, msg: mqtt.ReceiveMessage) -> None:
        try:
            volume = float(msg.payload)
        except (TypeError, ValueError):
            _LOGGER.warning("ignoring malformed volume payload on %s: %r", TOPIC_VOLUME, msg.payload)
            return
        self._attr_volume_level = volume
        self.async_write_ha_state()

    async def async_media_play(self) -> None:
        """Send the daemon's "play" action (FIFO key "P")."""
        await self._async_publish_command({"action": ACTION_PLAY})
        self._attr_state = MediaPlayerState.PLAYING
        self.async_write_ha_state()

    async def async_media_pause(self) -> None:
        """Send the daemon's "pause" action (FIFO key "S")."""
        await self._async_publish_command({"action": ACTION_PAUSE})
        self._attr_state = MediaPlayerState.PAUSED
        self.async_write_ha_state()

    async def async_media_next_track(self) -> None:
        """Send the daemon's "next" action (FIFO key "n").

        There is no "previous track" support in the daemon at all -- no
        pianobar keybinding exists for it (pandora-mqtt-spec.md's Command
        Surface table) -- so MediaPlayerEntityFeature.PREVIOUS_TRACK is
        deliberately never included in _attr_supported_features.
        """
        await self._async_publish_command({"action": ACTION_NEXT})
        self._attr_state = MediaPlayerState.PLAYING
        self.async_write_ha_state()

    async def async_select_source(self, source: str) -> None:
        """Switch stations via the daemon's select_source action.

        The daemon resolves `source` (a station name) against its own
        most-recently-known station list to find the FIFO index to send
        (commandHandler.ts's findStationIndex) -- this entity just passes
        the chosen name straight through, exactly as haDiscovery.ts's
        station `select` entity's command_template already does.
        """
        await self._async_publish_command({"action": ACTION_SELECT_SOURCE, "station": source})

    async def async_set_volume_level(self, volume: float) -> None:
        """Send volume_set with a plain 0.0-1.0 passthrough -- no curve.

        Matches commandHandler.ts's handleVolumeSet exactly: the daemon
        applies this as an absolute system/PipeWire output level via wpctl
        (systemVolume.ts), not pianobar's own internal ReplayGain gain, and
        it is intentionally linear -- no perceptual/logarithmic curve is
        applied here or by the daemon.
        """
        await self._async_publish_command({"action": ACTION_VOLUME_SET, "volume": volume})
        self._attr_volume_level = volume
        self.async_write_ha_state()

    async def _async_publish_command(self, payload: dict[str, Any]) -> None:
        await mqtt.async_publish(self.hass, COMMAND_TOPIC, json.dumps(payload), qos=MQTT_QOS)

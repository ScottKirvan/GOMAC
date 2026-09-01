"""Tests for the GOMAC Pandora media_player entity.

Uses pytest-homeassistant-custom-component's mqtt_mock fixture (a MagicMock
wrapping HA's real mqtt.MQTT client, so publishes/subscribes exercise the
real HA mqtt integration code path) and async_fire_mqtt_message to simulate
the pianobar daemon publishing to its real, documented topics.
"""

import json
from typing import Any

import pytest
from homeassistant.components.media_player import MediaPlayerEntityFeature
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_mqtt_message

from custom_components.gomac_pandora.const import (
    AVAILABILITY_TOPIC,
    COMMAND_TOPIC,
    DOMAIN,
    MQTT_DEVICE_DOMAIN,
    MQTT_DEVICE_IDENTIFIER,
    TOPIC_ALBUM,
    TOPIC_ARTIST,
    TOPIC_COVER_ART,
    TOPIC_STATION,
    TOPIC_STATIONS,
    TOPIC_TITLE,
    TOPIC_VOLUME,
    UNIQUE_ID,
)


@pytest.fixture
async def config_entry(hass: HomeAssistant, mqtt_mock: Any) -> MockConfigEntry:
    """Load the integration under a config entry, mirroring the config flow's output."""
    entry = MockConfigEntry(domain=DOMAIN, unique_id=DOMAIN, data={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


@pytest.fixture
def entity_id(hass: HomeAssistant, config_entry: MockConfigEntry) -> str:
    """Look the entity up by its stable unique_id rather than assuming a slug."""
    registry = er.async_get(hass)
    found = registry.async_get_entity_id("media_player", DOMAIN, UNIQUE_ID)
    assert found is not None
    return found


def _last_command_payload(mqtt_mock: Any) -> dict[str, Any]:
    call = mqtt_mock.async_publish.call_args
    assert call.args[0] == COMMAND_TOPIC
    return json.loads(call.args[1])


async def test_entity_lands_on_the_daemons_existing_device(
    hass: HomeAssistant, config_entry: MockConfigEntry, entity_id: str
) -> None:
    """This entity must join the same HA device as haDiscovery.ts's buttons.

    That device is created by HA's own MQTT discovery under identifiers
    {("mqtt", "gomac-pandora")} -- not this integration's own domain (see
    const.py's doc comment). Registering under any other identifier tuple
    would silently create a second device instead of joining the first.
    """
    registry = dr.async_get(hass)
    device = registry.async_get_device(identifiers={(MQTT_DEVICE_DOMAIN, MQTT_DEVICE_IDENTIFIER)})
    assert device is not None
    assert device.manufacturer == "GOMAC"

    entity_registry = er.async_get(hass)
    entry = entity_registry.async_get(entity_id)
    assert entry is not None
    assert entry.device_id == device.id


async def test_supported_features_has_no_previous_track(
    hass: HomeAssistant, config_entry: MockConfigEntry, entity_id: str
) -> None:
    """pianobar has no "previous track" keybinding at all -- must stay unexposed."""
    state = hass.states.get(entity_id)
    assert state is not None
    features = MediaPlayerEntityFeature(state.attributes["supported_features"])
    assert features == (
        MediaPlayerEntityFeature.PLAY
        | MediaPlayerEntityFeature.PAUSE
        | MediaPlayerEntityFeature.NEXT_TRACK
        | MediaPlayerEntityFeature.VOLUME_SET
        | MediaPlayerEntityFeature.SELECT_SOURCE
    )
    assert not features & MediaPlayerEntityFeature.PREVIOUS_TRACK


async def test_starts_unavailable_until_availability_topic_reports_in(
    hass: HomeAssistant, config_entry: MockConfigEntry, entity_id: str
) -> None:
    assert hass.states.get(entity_id).state == "unavailable"

    async_fire_mqtt_message(hass, AVAILABILITY_TOPIC, "online")
    await hass.async_block_till_done()
    assert hass.states.get(entity_id).state != "unavailable"

    async_fire_mqtt_message(hass, AVAILABILITY_TOPIC, "offline")
    await hass.async_block_till_done()
    assert hass.states.get(entity_id).state == "unavailable"


async def test_state_topics_map_onto_the_expected_attributes(
    hass: HomeAssistant, config_entry: MockConfigEntry, entity_id: str
) -> None:
    async_fire_mqtt_message(hass, AVAILABILITY_TOPIC, "online")
    async_fire_mqtt_message(hass, TOPIC_TITLE, "Clocks")
    async_fire_mqtt_message(hass, TOPIC_ARTIST, "Coldplay")
    async_fire_mqtt_message(hass, TOPIC_ALBUM, "A Rush of Blood to the Head")
    async_fire_mqtt_message(hass, TOPIC_STATION, "Coldplay Radio")
    async_fire_mqtt_message(hass, TOPIC_COVER_ART, "https://example.com/art.jpg")
    async_fire_mqtt_message(hass, TOPIC_STATIONS, json.dumps(["Coldplay Radio", "Tool Radio"]))
    async_fire_mqtt_message(hass, TOPIC_VOLUME, "0.42")
    await hass.async_block_till_done()

    state = hass.states.get(entity_id)
    assert state.attributes["media_title"] == "Clocks"
    assert state.attributes["media_artist"] == "Coldplay"
    assert state.attributes["media_album_name"] == "A Rush of Blood to the Head"
    assert state.attributes["source"] == "Coldplay Radio"
    assert state.attributes["entity_picture"] == "https://example.com/art.jpg"
    assert state.attributes["source_list"] == ["Coldplay Radio", "Tool Radio"]
    assert state.attributes["volume_level"] == 0.42


async def test_title_change_infers_playing_state(
    hass: HomeAssistant, config_entry: MockConfigEntry, entity_id: str
) -> None:
    """No daemon telemetry says "playing" directly -- a changed title implies it."""
    async_fire_mqtt_message(hass, AVAILABILITY_TOPIC, "online")
    async_fire_mqtt_message(hass, TOPIC_TITLE, "Song A")
    await hass.async_block_till_done()
    assert hass.states.get(entity_id).state == "playing"


async def test_pause_is_not_resurrected_by_a_repeated_title(
    hass: HomeAssistant, config_entry: MockConfigEntry, entity_id: str
) -> None:
    """Documents the exact boundary of the playback-state heuristic.

    songfinish republishes the *same, still-current* title moments before
    the next songstart -- that must not flip a user-issued pause back to
    "playing" behind their back. Only an actual title *change* should.
    """
    async_fire_mqtt_message(hass, AVAILABILITY_TOPIC, "online")
    async_fire_mqtt_message(hass, TOPIC_TITLE, "Song A")
    await hass.async_block_till_done()

    await hass.services.async_call(
        "media_player", "media_pause", {"entity_id": entity_id}, blocking=True
    )
    assert hass.states.get(entity_id).state == "paused"

    async_fire_mqtt_message(hass, TOPIC_TITLE, "Song A")
    await hass.async_block_till_done()
    assert hass.states.get(entity_id).state == "paused"

    async_fire_mqtt_message(hass, TOPIC_TITLE, "Song B")
    await hass.async_block_till_done()
    assert hass.states.get(entity_id).state == "playing"


async def test_media_play_publishes_play_action(
    hass: HomeAssistant, config_entry: MockConfigEntry, entity_id: str, mqtt_mock: Any
) -> None:
    async_fire_mqtt_message(hass, AVAILABILITY_TOPIC, "online")
    await hass.async_block_till_done()
    await hass.services.async_call("media_player", "media_play", {"entity_id": entity_id}, blocking=True)
    assert _last_command_payload(mqtt_mock) == {"action": "play"}
    assert hass.states.get(entity_id).state == "playing"


async def test_media_pause_publishes_pause_action(
    hass: HomeAssistant, config_entry: MockConfigEntry, entity_id: str, mqtt_mock: Any
) -> None:
    async_fire_mqtt_message(hass, AVAILABILITY_TOPIC, "online")
    await hass.async_block_till_done()
    await hass.services.async_call("media_player", "media_pause", {"entity_id": entity_id}, blocking=True)
    assert _last_command_payload(mqtt_mock) == {"action": "pause"}
    assert hass.states.get(entity_id).state == "paused"


async def test_media_next_track_publishes_next_action(
    hass: HomeAssistant, config_entry: MockConfigEntry, entity_id: str, mqtt_mock: Any
) -> None:
    async_fire_mqtt_message(hass, AVAILABILITY_TOPIC, "online")
    await hass.async_block_till_done()
    await hass.services.async_call("media_player", "media_next_track", {"entity_id": entity_id}, blocking=True)
    assert _last_command_payload(mqtt_mock) == {"action": "next"}


async def test_select_source_publishes_station_name_verbatim(
    hass: HomeAssistant, config_entry: MockConfigEntry, entity_id: str, mqtt_mock: Any
) -> None:
    async_fire_mqtt_message(hass, AVAILABILITY_TOPIC, "online")
    async_fire_mqtt_message(hass, TOPIC_STATIONS, json.dumps(["Tool Radio", "Coldplay Radio"]))
    await hass.async_block_till_done()

    await hass.services.async_call(
        "media_player",
        "select_source",
        {"entity_id": entity_id, "source": "Tool Radio"},
        blocking=True,
    )
    assert _last_command_payload(mqtt_mock) == {"action": "select_source", "station": "Tool Radio"}


async def test_set_volume_level_is_a_linear_passthrough(
    hass: HomeAssistant, config_entry: MockConfigEntry, entity_id: str, mqtt_mock: Any
) -> None:
    """No perceptual/logarithmic curve -- matches commandHandler.ts exactly."""
    async_fire_mqtt_message(hass, AVAILABILITY_TOPIC, "online")
    await hass.async_block_till_done()
    await hass.services.async_call(
        "media_player",
        "volume_set",
        {"entity_id": entity_id, "volume_level": 0.73},
        blocking=True,
    )
    assert _last_command_payload(mqtt_mock) == {"action": "volume_set", "volume": 0.73}
    assert hass.states.get(entity_id).attributes["volume_level"] == 0.73


async def test_malformed_stations_payload_is_ignored(
    hass: HomeAssistant, config_entry: MockConfigEntry, entity_id: str, caplog: pytest.LogCaptureFixture
) -> None:
    async_fire_mqtt_message(hass, TOPIC_STATIONS, "not-json")
    await hass.async_block_till_done()
    assert hass.states.get(entity_id).attributes.get("source_list") is None
    assert "malformed stations payload" in caplog.text


async def test_malformed_volume_payload_is_ignored(
    hass: HomeAssistant, config_entry: MockConfigEntry, entity_id: str, caplog: pytest.LogCaptureFixture
) -> None:
    async_fire_mqtt_message(hass, TOPIC_VOLUME, "not-a-number")
    await hass.async_block_till_done()
    assert hass.states.get(entity_id).attributes.get("volume_level") is None
    assert "malformed volume payload" in caplog.text


async def test_unload_entry_unsubscribes_cleanly(
    hass: HomeAssistant, config_entry: MockConfigEntry
) -> None:
    assert await hass.config_entries.async_unload(config_entry.entry_id)
    await hass.async_block_till_done()

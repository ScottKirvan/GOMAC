"""The GOMAC Pandora (pianobar) media player integration.

A Home Assistant custom integration that is a genuine MQTT subscriber/
publisher on the pianobar bridge daemon's existing `gomac/pandora/*` topic
contract (src/integrations/pianobar/notes/pandora-mqtt-spec.md). It makes no
daemon changes and invents no new topics -- see media_player.py for the
entity itself.
"""

from __future__ import annotations

from homeassistant.components import mqtt
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryNotReady

PLATFORMS: list[Platform] = [Platform.MEDIA_PLAYER]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up GOMAC Pandora from a config entry."""
    if not await mqtt.async_wait_for_mqtt_client(hass):
        raise ConfigEntryNotReady("MQTT integration is not set up or not yet connected to a broker")

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)

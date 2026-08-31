"""Constants for the GOMAC Pandora (pianobar) media player integration."""

from __future__ import annotations

DOMAIN = "gomac_pandora"

# The pianobar daemon's own MQTT-discovery device block (haDiscovery.ts's
# haDevice()) is picked up by Home Assistant's *built-in* MQTT integration,
# which always namespaces `device.identifiers` under its own domain
# constant -- confirmed directly against HA core
# (homeassistant/components/mqtt/entity.py:
# `identifiers={(DOMAIN, id_) for id_ in specifications[CONF_IDENTIFIERS]}`,
# where DOMAIN there is "mqtt", not the publishing daemon's identity).
# Reusing that exact ("mqtt", "gomac-pandora") tuple here -- not this
# integration's own domain -- is what makes this entity land on the same HA
# device as the daemon's existing love/ban/tired/restart button entities
# instead of creating a second device.
MQTT_DEVICE_DOMAIN = "mqtt"
MQTT_DEVICE_IDENTIFIER = "gomac-pandora"

# Topic names match the pianobar daemon's defaults exactly (see
# src/integrations/pianobar/src/config.ts's loadConfig and
# src/integrations/pianobar/src/telemetry.ts's STATE_TOPIC_PREFIX). The
# daemon allows its command/availability topic names to be overridden via
# MQTT_COMMAND_TOPIC/MQTT_AVAILABILITY_TOPIC env vars; this integration
# does not expose that as a config option (the config flow takes no input
# at all -- see config_flow.py). If a real deployment ever overrides those
# env vars from their defaults, these constants need updating to match.
COMMAND_TOPIC = "gomac/pandora/cmd"
AVAILABILITY_TOPIC = "gomac/pandora/availability"
STATE_TOPIC_PREFIX = "gomac/pandora/state"

TOPIC_TITLE = f"{STATE_TOPIC_PREFIX}/title"
TOPIC_ARTIST = f"{STATE_TOPIC_PREFIX}/artist"
TOPIC_ALBUM = f"{STATE_TOPIC_PREFIX}/album"
TOPIC_STATION = f"{STATE_TOPIC_PREFIX}/station"
TOPIC_COVER_ART = f"{STATE_TOPIC_PREFIX}/cover_art"
TOPIC_STATIONS = f"{STATE_TOPIC_PREFIX}/stations"
TOPIC_VOLUME = f"{STATE_TOPIC_PREFIX}/volume"

AVAILABILITY_ONLINE = "online"
AVAILABILITY_OFFLINE = "offline"

# Matches commandHandler.ts's Tier 1 action names / select_source / volume_set
# exactly -- these are sent verbatim as the "action" field on COMMAND_TOPIC.
ACTION_PLAY = "play"
ACTION_PAUSE = "pause"
ACTION_NEXT = "next"
ACTION_SELECT_SOURCE = "select_source"
ACTION_VOLUME_SET = "volume_set"

UNIQUE_ID = "gomac_pandora_media_player"
ENTITY_NAME = "Pandora"

# The daemon publishes/subscribes at qos 1 throughout (mqttClient.ts,
# haDiscovery.ts) -- matched here for consistency, not because qos 1 is
# otherwise required.
MQTT_QOS = 1

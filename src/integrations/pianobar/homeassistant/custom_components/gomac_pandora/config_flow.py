"""Config flow for the GOMAC Pandora (pianobar) media player integration.

Takes no real user input. Its only job is to force a config entry into
existence so the media_player entity can attach to a Device -- a legacy
YAML-platform entity can't, even with `device_info` set (verified directly
against the ad hoc TheFlea `mediaplayer_mqtt` integration's own code
comments; see notes/pandora-mqtt-spec.md's "Lessons From the Ad Hoc TheFlea
Integration"). The singleton pattern below (`async_set_unique_id` +
`_abort_if_unique_id_configured`) copies that same integration's proven
approach: only one instance can ever be added, since there is only one
pianobar daemon/device for this entity to represent.
"""

from __future__ import annotations

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult

from .const import DOMAIN, ENTITY_NAME


class GomacPandoraConfigFlow(ConfigFlow, domain=DOMAIN):
    """Config flow for GOMAC Pandora (pianobar)."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, str] | None = None) -> ConfigFlowResult:
        """Single confirmation step; no fields to collect."""
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        if user_input is not None:
            return self.async_create_entry(title=ENTITY_NAME, data={})

        return self.async_show_form(step_id="user")

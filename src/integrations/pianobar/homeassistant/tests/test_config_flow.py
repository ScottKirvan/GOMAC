"""Tests for the zero-input singleton config flow."""

from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType

from custom_components.gomac_pandora.const import DOMAIN


async def test_user_flow_creates_single_entry(hass: HomeAssistant) -> None:
    """The single confirmation step creates an entry with no data."""
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "user"

    result = await hass.config_entries.flow.async_configure(result["flow_id"], user_input={})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "Pandora"
    assert result["data"] == {}


async def test_user_flow_is_a_singleton(hass: HomeAssistant) -> None:
    """A second attempt aborts -- only one pianobar daemon/device exists."""
    first = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    await hass.config_entries.flow.async_configure(first["flow_id"], user_input={})

    second = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert second["type"] is FlowResultType.ABORT
    assert second["reason"] == "already_configured"

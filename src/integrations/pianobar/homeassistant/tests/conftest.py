"""Shared fixtures for the GOMAC Pandora media_player integration tests."""

import pytest

pytest_plugins = "pytest_homeassistant_custom_component"


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations: None) -> None:
    """Make custom_components/gomac_pandora loadable by hass.config_entries."""
    yield

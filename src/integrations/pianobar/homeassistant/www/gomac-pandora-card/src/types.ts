/**
 * Minimal local subset of Home Assistant's frontend types -- just what this
 * card touches. Deliberately not depending on `home-assistant-js-websocket`
 * or `custom-card-helpers`: those track HA core's internal frontend release
 * cycle and would be extra churn for a handful of fields this card reads
 * off `hass.states[...]` and one `hass.callService` call.
 */
export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  callService(domain: string, service: string, serviceData?: Record<string, unknown>): Promise<unknown>;
}

/** The `media_player.gomac_pandora`/button entities this card targets, all configurable per standard Lovelace card conventions. */
export interface GomacPandoraCardConfig {
  type: string;
  entity?: string;
  love_entity?: string;
  ban_entity?: string;
  tired_entity?: string;
  restart_entity?: string;
}

// custom_components/gomac_pandora/media_player.py: _attr_has_entity_name = True,
// _attr_name = None, device name "Pandora" -> HA derives entity_id "media_player.pandora".
export const DEFAULT_ENTITY = "media_player.pandora";

// src/integrations/pianobar/src/haDiscovery.ts's BUTTONS list -- object_id is
// set explicitly on each MQTT discovery config, so HA's MQTT integration uses
// it verbatim as the entity_id suffix (button.<object_id>).
export const DEFAULT_LOVE_ENTITY = "button.pandora_love";
export const DEFAULT_BAN_ENTITY = "button.pandora_ban";
export const DEFAULT_TIRED_ENTITY = "button.pandora_tired";
export const DEFAULT_RESTART_ENTITY = "button.pandora_restart";

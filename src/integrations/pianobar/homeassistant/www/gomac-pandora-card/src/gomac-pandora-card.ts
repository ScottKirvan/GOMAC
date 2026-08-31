import { LitElement, html, css, nothing, type PropertyValues } from "lit";
import { property, state } from "lit/decorators.js";
import { debounce, type Debounced } from "./debounce.js";
import {
  DEFAULT_BAN_ENTITY,
  DEFAULT_ENTITY,
  DEFAULT_LOVE_ENTITY,
  DEFAULT_RESTART_ENTITY,
  DEFAULT_TIRED_ENTITY,
  type GomacPandoraCardConfig,
  type HassEntity,
  type HomeAssistant,
} from "./types.js";

// Matches HA's own media_player more-info dialog exactly (frontend
// src/dialogs/more-info/controls/more-info-media_player.ts): 100ms
// trailing debounce on drag, 2% step. See README's "Volume slider design"
// section for how this was verified against HA's actual source.
const VOLUME_DEBOUNCE_MS = 100;
const VOLUME_STEP_PERCENT = 2;

// Safety net only: if the daemon never echoes back a volume that matches
// what the user dragged to (dropped MQTT message, daemon restart mid-drag,
// wpctl rounding permanently off by more than the tolerance below), don't
// leave the slider stuck showing a locally-optimistic value forever.
const VOLUME_CONFIRM_TIMEOUT_MS = 5000;
const VOLUME_CONFIRM_TOLERANCE_PERCENT = 1;

export class GomacPandoraCard extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: GomacPandoraCardConfig;
  @state() private _localVolumePercent?: number;

  private _volumeConfirmTimeout?: ReturnType<typeof setTimeout>;
  private readonly _debouncedSetVolume: Debounced<[number]>;

  constructor() {
    super();
    this._debouncedSetVolume = debounce((percent: number) => this._callSetVolume(percent), VOLUME_DEBOUNCE_MS);
  }

  public static getStubConfig(): GomacPandoraCardConfig {
    return { type: "custom:gomac-pandora-card", entity: DEFAULT_ENTITY };
  }

  public setConfig(config: GomacPandoraCardConfig): void {
    if (!config || typeof config !== "object") {
      throw new Error("gomac-pandora-card: invalid configuration");
    }
    this._config = config;
  }

  public getCardSize(): number {
    return 4;
  }

  private get _entityId(): string {
    return this._config?.entity ?? DEFAULT_ENTITY;
  }

  private get _loveEntityId(): string {
    return this._config?.love_entity ?? DEFAULT_LOVE_ENTITY;
  }

  private get _banEntityId(): string {
    return this._config?.ban_entity ?? DEFAULT_BAN_ENTITY;
  }

  private get _tiredEntityId(): string {
    return this._config?.tired_entity ?? DEFAULT_TIRED_ENTITY;
  }

  private get _restartEntityId(): string {
    return this._config?.restart_entity ?? DEFAULT_RESTART_ENTITY;
  }

  private get _watchedEntityIds(): string[] {
    return [this._entityId, this._loveEntityId, this._banEntityId, this._tiredEntityId, this._restartEntityId];
  }

  private get _stateObj(): HassEntity | undefined {
    return this.hass?.states[this._entityId];
  }

  /**
   * HA reassigns `card.hass` on essentially every state change anywhere in
   * the system, not just this entity -- without this guard, every one of
   * those ticks would re-render and re-bind the volume slider's `.value`
   * from (possibly stale) entity state while the user is mid-drag, fighting
   * the pointer. Only re-render on a config/internal-state change or when
   * one of the entities this card actually reads changes reference.
   */
  protected shouldUpdate(changedProps: PropertyValues): boolean {
    if (!this._config) {
      return false;
    }
    if (!changedProps.has("hass")) {
      return true;
    }
    const oldHass = changedProps.get("hass") as HomeAssistant | undefined;
    if (!oldHass) {
      return true;
    }
    return this._watchedEntityIds.some((id) => oldHass.states[id] !== this.hass!.states[id]);
  }

  /**
   * Release local-override control back to real entity state once the
   * daemon's telemetry confirms the volume we set -- not on a fixed delay,
   * so there's no flash back to the pre-drag value while waiting for the
   * MQTT round trip (matching HA's own more-info dialog, which drives the
   * slider element directly and only lets a real entity-state change
   * override it once one actually arrives).
   */
  protected willUpdate(changedProps: PropertyValues): void {
    if (this._localVolumePercent === undefined || !changedProps.has("hass")) {
      return;
    }
    const confirmed = this._volumePercentFromState();
    if (confirmed !== undefined && Math.abs(confirmed - this._localVolumePercent) <= VOLUME_CONFIRM_TOLERANCE_PERCENT) {
      this._clearLocalVolume();
    }
  }

  protected render() {
    if (!this._config || !this.hass) {
      return nothing;
    }

    const stateObj = this._stateObj;
    if (!stateObj) {
      return html`
        <ha-card>
          <div class="missing-entity">Entity <code>${this._entityId}</code> not found.</div>
        </ha-card>
      `;
    }

    const attrs = stateObj.attributes;
    const title = typeof attrs.media_title === "string" ? attrs.media_title : "";
    const artist = typeof attrs.media_artist === "string" ? attrs.media_artist : "";
    const album = typeof attrs.media_album_name === "string" ? attrs.media_album_name : "";
    const picture = typeof attrs.entity_picture === "string" ? attrs.entity_picture : "";
    const source = typeof attrs.source === "string" ? attrs.source : "";
    const sourceList = Array.isArray(attrs.source_list) ? (attrs.source_list as unknown[]).filter((s): s is string => typeof s === "string") : [];

    const isUnavailable = stateObj.state === "unavailable" || stateObj.state === "unknown";
    const isPlaying = stateObj.state === "playing";
    const volumePercent = this._localVolumePercent ?? this._volumePercentFromState() ?? 0;

    return html`
      <ha-card>
        <div class="player">
          <div class="now-playing">
            <div class="cover" style="${picture ? `background-image: url(${picture})` : ""}">
              ${picture ? nothing : html`<ha-icon icon="mdi:radio"></ha-icon>`}
            </div>
            <div class="meta">
              <div class="title">${title || "Nothing playing"}</div>
              ${artist ? html`<div class="artist">${artist}</div>` : nothing}
              ${album ? html`<div class="album">${album}</div>` : nothing}
              ${source ? html`<div class="source-badge">${source}</div>` : nothing}
            </div>
          </div>

          <div class="transport">
            <ha-icon-button
              .disabled=${isUnavailable}
              .label=${isPlaying ? "Pause" : "Play"}
              @click=${this._handlePlayPause}
            >
              <ha-icon icon="${isPlaying ? "mdi:pause" : "mdi:play"}"></ha-icon>
            </ha-icon-button>
            <ha-icon-button .disabled=${isUnavailable} label="Next" @click=${this._handleNext}>
              <ha-icon icon="mdi:skip-next"></ha-icon>
            </ha-icon-button>
          </div>

          <div class="volume-row">
            <ha-icon icon="${volumePercent === 0 ? "mdi:volume-mute" : "mdi:volume-high"}"></ha-icon>
            <input
              type="range"
              class="volume-slider"
              min="0"
              max="100"
              step="${VOLUME_STEP_PERCENT}"
              .value="${String(volumePercent)}"
              ?disabled=${isUnavailable}
              @input=${this._handleVolumeInput}
              @change=${this._handleVolumeChange}
              aria-label="Volume"
            />
            <span class="volume-value">${volumePercent}%</span>
          </div>

          <div class="source-row">
            <ha-icon icon="mdi:radio-tower"></ha-icon>
            <select
              class="source-select"
              ?disabled=${isUnavailable || sourceList.length === 0}
              @change=${this._handleSourceChange}
              aria-label="Station"
            >
              ${sourceList.length === 0
                ? html`<option value="" selected>${source || "No stations known yet"}</option>`
                : sourceList.map((station) => html`<option value="${station}" ?selected=${station === source}>${station}</option>`)}
            </select>
          </div>

          <div class="rating-row">
            <ha-icon-button .disabled=${isUnavailable} label="Love" @click=${() => this._pressButton(this._loveEntityId)}>
              <ha-icon icon="mdi:heart"></ha-icon>
            </ha-icon-button>
            <ha-icon-button .disabled=${isUnavailable} label="Ban" @click=${() => this._pressButton(this._banEntityId)}>
              <ha-icon icon="mdi:thumb-down"></ha-icon>
            </ha-icon-button>
            <ha-icon-button .disabled=${isUnavailable} label="Tired" @click=${() => this._pressButton(this._tiredEntityId)}>
              <ha-icon icon="mdi:sleep"></ha-icon>
            </ha-icon-button>
            <ha-icon-button label="Restart pianobar" @click=${() => this._pressButton(this._restartEntityId)}>
              <ha-icon icon="mdi:restart"></ha-icon>
            </ha-icon-button>
          </div>
        </div>
      </ha-card>
    `;
  }

  private _volumePercentFromState(): number | undefined {
    const level = this._stateObj?.attributes.volume_level;
    return typeof level === "number" ? Math.round(level * 100) : undefined;
  }

  private _clearLocalVolume(): void {
    this._localVolumePercent = undefined;
    if (this._volumeConfirmTimeout !== undefined) {
      clearTimeout(this._volumeConfirmTimeout);
      this._volumeConfirmTimeout = undefined;
    }
  }

  private _handlePlayPause(): void {
    const stateObj = this._stateObj;
    if (!stateObj || !this.hass) {
      return;
    }
    const service = stateObj.state === "playing" ? "media_pause" : "media_play";
    void this.hass.callService("media_player", service, { entity_id: this._entityId });
  }

  private _handleNext(): void {
    void this.hass?.callService("media_player", "media_next_track", { entity_id: this._entityId });
  }

  private _handleSourceChange(ev: Event): void {
    const value = (ev.target as HTMLSelectElement).value;
    if (!value || !this.hass) {
      return;
    }
    void this.hass.callService("media_player", "select_source", { entity_id: this._entityId, source: value });
  }

  private _handleVolumeInput(ev: Event): void {
    const percent = (ev.target as HTMLInputElement).valueAsNumber;
    this._setLocalVolume(percent);
    this._debouncedSetVolume(percent);
  }

  private _handleVolumeChange(ev: Event): void {
    const percent = (ev.target as HTMLInputElement).valueAsNumber;
    this._setLocalVolume(percent);
    this._debouncedSetVolume.cancel();
    this._callSetVolume(percent);
  }

  private _setLocalVolume(percent: number): void {
    this._localVolumePercent = percent;
    if (this._volumeConfirmTimeout !== undefined) {
      clearTimeout(this._volumeConfirmTimeout);
    }
    this._volumeConfirmTimeout = setTimeout(() => {
      this._volumeConfirmTimeout = undefined;
      this._localVolumePercent = undefined;
      this.requestUpdate();
    }, VOLUME_CONFIRM_TIMEOUT_MS);
  }

  private _callSetVolume(percent: number): void {
    void this.hass?.callService("media_player", "volume_set", {
      entity_id: this._entityId,
      volume_level: percent / 100,
    });
  }

  private _pressButton(entityId: string): void {
    void this.hass?.callService("button", "press", { entity_id: entityId });
  }

  static styles = css`
    ha-card {
      overflow: hidden;
    }

    .player {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
    }

    .missing-entity {
      padding: 16px;
      color: var(--error-color, #db4437);
    }

    .now-playing {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .cover {
      flex: 0 0 auto;
      width: 64px;
      height: 64px;
      border-radius: 8px;
      background-color: var(--secondary-background-color);
      background-size: cover;
      background-position: center;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--secondary-text-color);
    }

    .cover ha-icon {
      --mdc-icon-size: 28px;
    }

    .meta {
      min-width: 0;
      flex: 1 1 auto;
    }

    .title {
      font-size: 18px;
      font-weight: 500;
      color: var(--primary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .artist,
    .album {
      font-size: 13px;
      color: var(--secondary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .source-badge {
      margin-top: 4px;
      display: inline-block;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      color: var(--primary-color);
    }

    .transport {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .transport ha-icon-button {
      --mdc-icon-button-size: 48px;
      --mdc-icon-size: 28px;
      color: var(--primary-text-color);
    }

    .volume-row,
    .source-row {
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--secondary-text-color);
    }

    .volume-slider {
      flex: 1 1 auto;
      appearance: none;
      -webkit-appearance: none;
      height: 4px;
      border-radius: 2px;
      background: var(--divider-color);
      outline: none;
    }

    .volume-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--primary-color);
      cursor: pointer;
    }

    .volume-slider::-moz-range-thumb {
      width: 16px;
      height: 16px;
      border: none;
      border-radius: 50%;
      background: var(--primary-color);
      cursor: pointer;
    }

    .volume-slider:disabled::-webkit-slider-thumb {
      background: var(--disabled-text-color);
    }

    .volume-value {
      flex: 0 0 auto;
      width: 2.5em;
      text-align: right;
      font-size: 13px;
    }

    .source-select {
      flex: 1 1 auto;
      background: none;
      border: none;
      border-bottom: 1px solid var(--divider-color);
      color: var(--primary-text-color);
      font-size: 14px;
      padding: 4px 0;
    }

    .rating-row {
      display: flex;
      align-items: center;
      justify-content: space-evenly;
      border-top: 1px solid var(--divider-color);
      padding-top: 8px;
    }

    .rating-row ha-icon-button {
      color: var(--secondary-text-color);
    }
  `;
}

customElements.define("gomac-pandora-card", GomacPandoraCard);

declare global {
  interface Window {
    customCards?: Array<Record<string, unknown>>;
  }
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "gomac-pandora-card",
  name: "GOMAC Pandora Card",
  description: "Unified media_player card for the pianobar/Pandora bridge, with a live-drag volume slider and love/ban/tired/restart controls.",
});

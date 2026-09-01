import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../src/gomac-pandora-card.js";
import type { GomacPandoraCard } from "../src/gomac-pandora-card.js";
import type { HassEntity, HomeAssistant } from "../src/types.js";

function makeHass(states: Record<string, Partial<HassEntity> & { state: string }>): HomeAssistant {
  const fullStates: Record<string, HassEntity> = {};
  for (const [entityId, partial] of Object.entries(states)) {
    fullStates[entityId] = {
      entity_id: entityId,
      state: partial.state,
      attributes: partial.attributes ?? {},
    };
  }
  return {
    states: fullStates,
    callService: vi.fn().mockResolvedValue(undefined),
  };
}

async function mountCard(hass: HomeAssistant, config: Record<string, unknown> = {}): Promise<GomacPandoraCard> {
  const el = document.createElement("gomac-pandora-card") as GomacPandoraCard;
  el.setConfig({ type: "custom:gomac-pandora-card", ...config });
  el.hass = hass;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

const BASE_STATES = {
  "media_player.pandora": {
    state: "playing",
    attributes: {
      media_title: "Song Title",
      media_artist: "Some Artist",
      media_album_name: "Some Album",
      entity_picture: "https://example.com/cover.jpg",
      source: "Coffee House Radio",
      source_list: ["Coffee House Radio", "90s Alternative"],
      volume_level: 0.5,
    },
  },
  "button.pandora_love": { state: "unknown" },
  "button.pandora_ban": { state: "unknown" },
  "button.pandora_tired": { state: "unknown" },
  "button.pandora_restart": { state: "unknown" },
};

describe("gomac-pandora-card", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("registers the custom element and the Lovelace card picker entry", () => {
    expect(customElements.get("gomac-pandora-card")).toBeDefined();
    expect(window.customCards?.some((c) => c.type === "gomac-pandora-card")).toBe(true);
  });

  it("renders now-playing info from the media_player entity's standard attributes", async () => {
    const hass = makeHass(BASE_STATES);
    const el = await mountCard(hass);
    const root = el.shadowRoot!;

    expect(root.querySelector(".title")?.textContent).toContain("Song Title");
    expect(root.querySelector(".artist")?.textContent).toContain("Some Artist");
    expect(root.querySelector(".album")?.textContent).toContain("Some Album");
    expect(root.querySelector(".source-badge")?.textContent).toContain("Coffee House Radio");
    expect(root.querySelector(".cover")?.getAttribute("style")).toContain("https://example.com/cover.jpg");
  });

  it("shows a placeholder when the configured entity does not exist", async () => {
    const hass = makeHass({});
    const el = await mountCard(hass, { entity: "media_player.nope" });
    expect(el.shadowRoot!.querySelector(".missing-entity")?.textContent).toContain("media_player.nope");
  });

  it("defaults to media_player.pandora and the daemon's real button object_ids when unconfigured", async () => {
    const hass = makeHass(BASE_STATES);
    const el = await mountCard(hass);
    await el.updateComplete;

    const buttons = el.shadowRoot!.querySelectorAll(".rating-row ha-icon-button");
    buttons[0]!.dispatchEvent(new Event("click"));
    expect(hass.callService).toHaveBeenCalledWith("button", "press", { entity_id: "button.pandora_love" });

    buttons[3]!.dispatchEvent(new Event("click"));
    expect(hass.callService).toHaveBeenCalledWith("button", "press", { entity_id: "button.pandora_restart" });
  });

  it("calls media_player.media_pause when playing, and media_play when not", async () => {
    const hass = makeHass(BASE_STATES);
    const el = await mountCard(hass);
    el.shadowRoot!.querySelector(".transport ha-icon-button")!.dispatchEvent(new Event("click"));
    expect(hass.callService).toHaveBeenCalledWith("media_player", "media_pause", { entity_id: "media_player.pandora" });

    document.body.innerHTML = "";
    const pausedHass = makeHass({
      ...BASE_STATES,
      "media_player.pandora": { ...BASE_STATES["media_player.pandora"], state: "paused" },
    });
    const el2 = await mountCard(pausedHass);
    el2.shadowRoot!.querySelector(".transport ha-icon-button")!.dispatchEvent(new Event("click"));
    expect(pausedHass.callService).toHaveBeenCalledWith("media_player", "media_play", { entity_id: "media_player.pandora" });
  });

  it("calls media_player.media_next_track for the next button", async () => {
    const hass = makeHass(BASE_STATES);
    const el = await mountCard(hass);
    const buttons = el.shadowRoot!.querySelectorAll(".transport ha-icon-button");
    buttons[1]!.dispatchEvent(new Event("click"));
    expect(hass.callService).toHaveBeenCalledWith("media_player", "media_next_track", { entity_id: "media_player.pandora" });
  });

  it("has no previous-track control", async () => {
    const hass = makeHass(BASE_STATES);
    const el = await mountCard(hass);
    expect(el.shadowRoot!.querySelectorAll(".transport ha-icon-button").length).toBe(2);
  });

  it("calls select_source with the chosen station name", async () => {
    const hass = makeHass(BASE_STATES);
    const el = await mountCard(hass);
    const select = el.shadowRoot!.querySelector<HTMLSelectElement>(".source-select")!;
    select.value = "90s Alternative";
    select.dispatchEvent(new Event("change"));
    expect(hass.callService).toHaveBeenCalledWith("media_player", "select_source", {
      entity_id: "media_player.pandora",
      source: "90s Alternative",
    });
  });

  describe("volume slider", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it("debounces volume_set calls while dragging (input event) but updates the displayed value immediately", async () => {
      const hass = makeHass(BASE_STATES);
      const el = await mountCard(hass);
      const slider = el.shadowRoot!.querySelector<HTMLInputElement>(".volume-slider")!;

      slider.value = "60";
      slider.dispatchEvent(new Event("input"));
      await el.updateComplete;

      // Displayed value updates live, before the debounced service call fires.
      expect(el.shadowRoot!.querySelector(".volume-value")?.textContent).toContain("60%");
      expect(hass.callService).not.toHaveBeenCalledWith("media_player", "volume_set", expect.anything());

      vi.advanceTimersByTime(100);
      expect(hass.callService).toHaveBeenCalledWith("media_player", "volume_set", {
        entity_id: "media_player.pandora",
        volume_level: 0.6,
      });
    });

    it("collapses rapid input events into a single debounced call for the last value", async () => {
      const hass = makeHass(BASE_STATES);
      const el = await mountCard(hass);
      const slider = el.shadowRoot!.querySelector<HTMLInputElement>(".volume-slider")!;

      for (const value of [55, 60, 65, 70]) {
        slider.value = String(value);
        slider.dispatchEvent(new Event("input"));
        vi.advanceTimersByTime(20);
      }

      vi.advanceTimersByTime(100);

      const volumeCalls = (hass.callService as ReturnType<typeof vi.fn>).mock.calls.filter(([domain, service]) => domain === "media_player" && service === "volume_set");
      expect(volumeCalls.length).toBe(1);
      expect(volumeCalls[0]![2]).toEqual({ entity_id: "media_player.pandora", volume_level: 0.7 });
    });

    it("sends an immediate authoritative call on release (change event), bypassing the debounce", async () => {
      const hass = makeHass(BASE_STATES);
      const el = await mountCard(hass);
      const slider = el.shadowRoot!.querySelector<HTMLInputElement>(".volume-slider")!;

      slider.value = "80";
      slider.dispatchEvent(new Event("input"));
      // Released before the 100ms debounce window elapses.
      vi.advanceTimersByTime(30);
      slider.dispatchEvent(new Event("change"));

      expect(hass.callService).toHaveBeenCalledWith("media_player", "volume_set", {
        entity_id: "media_player.pandora",
        volume_level: 0.8,
      });

      // The now-cancelled debounced call from the input event must not fire late and clobber it.
      vi.advanceTimersByTime(200);
      const volumeCalls = (hass.callService as ReturnType<typeof vi.fn>).mock.calls.filter(([domain, service]) => domain === "media_player" && service === "volume_set");
      expect(volumeCalls.length).toBe(1);
    });

    it("does not let an unrelated hass update reset the slider mid-drag", async () => {
      const hass = makeHass(BASE_STATES);
      const el = await mountCard(hass);
      const slider = el.shadowRoot!.querySelector<HTMLInputElement>(".volume-slider")!;

      slider.value = "60";
      slider.dispatchEvent(new Event("input"));
      await el.updateComplete;

      // Simulate HA reassigning `hass` for an unrelated entity change elsewhere
      // in the system, still reporting the old pre-drag volume for this entity.
      el.hass = makeHass(BASE_STATES);
      await el.updateComplete;

      expect(el.shadowRoot!.querySelector(".volume-value")?.textContent).toContain("60%");
    });

    it("releases the local override once the entity's real volume_level confirms it", async () => {
      const hass = makeHass(BASE_STATES);
      const el = await mountCard(hass);
      const slider = el.shadowRoot!.querySelector<HTMLInputElement>(".volume-slider")!;

      slider.value = "60";
      slider.dispatchEvent(new Event("input"));
      await el.updateComplete;

      const confirmingHass = makeHass({
        ...BASE_STATES,
        "media_player.pandora": { ...BASE_STATES["media_player.pandora"], attributes: { ...BASE_STATES["media_player.pandora"].attributes, volume_level: 0.6 } },
      });
      el.hass = confirmingHass;
      await el.updateComplete;

      // Now a genuinely external change (e.g. from the app or Bluetooth) should show through immediately.
      const externalHass = makeHass({
        ...BASE_STATES,
        "media_player.pandora": { ...BASE_STATES["media_player.pandora"], attributes: { ...BASE_STATES["media_player.pandora"].attributes, volume_level: 0.2 } },
      });
      el.hass = externalHass;
      await el.updateComplete;

      expect(el.shadowRoot!.querySelector(".volume-value")?.textContent).toContain("20%");
    });
  });
});

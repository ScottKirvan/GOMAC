# GOMAC Pandora Card

A custom Home Assistant Lovelace card for `media_player.pandora` (the
`gomac_pandora` custom integration in
`../custom_components/gomac_pandora/`, fronting the pianobar bridge daemon
in `src/integrations/pianobar/`). It replaces the stock `media_player` card
for this one entity, per
`src/integrations/pianobar/notes/pandora-mqtt-spec.md`'s "HA Entity Plan"
and "Phase 3b" — the stock card has no way to add custom buttons
(love/ban/tired/restart) or a live-drag volume slider.

**Frontend-only.** This card calls nothing but standard Home Assistant
services (`media_player.media_play`/`media_pause`/`media_next_track`/
`volume_set`/`select_source`, `button.press`) against entities the daemon
and the `gomac_pandora` integration already publish. It makes no changes to
either of those, and needs none — it is a pure Lovelace resource.

## What it shows

- Cover art, title, artist, album, and the current station — from
  `media_player.pandora`'s standard `entity_picture`/`media_title`/
  `media_artist`/`media_album_name`/`source` attributes.
- Play/pause and next-track buttons (`media_player.media_play` /
  `media_pause` / `media_next_track`). **No previous-track button** —
  pianobar has no such keybinding at all (see the spec's Command Surface
  table), so the entity correctly has no `PREVIOUS_TRACK` feature and this
  card doesn't invent a control for it.
- A volume slider (`media_player.volume_set`) that **updates live while
  dragging**. This is the main reason this card exists instead of the
  stock `media_player` card plus HA's generic `number` slider — see
  "Volume slider design" below.
- A station dropdown (`media_player.select_source`), populated from the
  entity's `source_list` attribute.
- Four buttons — Love, Ban, Tired, Restart — calling `button.press`
  against the daemon's existing `button.pandora_love` /
  `button.pandora_ban` / `button.pandora_tired` / `button.pandora_restart`
  entities (`src/integrations/pianobar/src/haDiscovery.ts`'s `BUTTONS`
  list; these object_ids are set explicitly there, so they're what HA's
  MQTT discovery actually assigns as the entity_id suffix). These four
  have no standard `MediaPlayerEntity` equivalent, which is exactly why
  the daemon still publishes them as separate `button` entities for this
  card to invoke.

## Volume slider design

Verified directly against Home Assistant frontend's own source
(`src/dialogs/more-info/controls/more-info-media_player.ts` and
`src/common/util/volume-slider.ts`, `home-assistant/frontend` on GitHub),
not assumed:

- On the native `input` event (fires continuously while dragging), the
  displayed value updates **immediately**, and a `media_player.volume_set`
  call is sent through a **100ms trailing debounce** — the same delay HA's
  own more-info dialog uses for its volume slider.
- On the native `change` event (fires once, on release), any pending
  debounced call is cancelled and a `media_player.volume_set` call for the
  final value is sent **immediately** — matching HA's own dialog calling
  `onSetVolume` directly from its `handleChange`, bypassing the debounce
  entirely on release.
- HA reassigns a card's `.hass` property on essentially every state change
  anywhere in the system, not just this entity. Without guarding against
  that, the slider would be re-bound from (possibly stale) entity state on
  almost every tick, fighting the user's own drag. `shouldUpdate` only
  re-renders on a config/internal-state change or when one of the five
  entities this card actually reads changes reference.
- Rather than clearing the locally-dragged value on a timer, it's held
  until the daemon's own telemetry round-trip confirms the volume that was
  set (`state.attributes.volume_level` matching within 1%), so there's no
  flash back to the pre-drag value while that confirmation is in flight —
  the same effect HA's dialog gets by mutating the slider element
  directly rather than only through its reactive template binding. A 5s
  safety timeout releases the override regardless, in case a confirmation
  never arrives (dropped MQTT message, daemon restart mid-drag).

This card uses a real native `<input type="range">` rather than HA's
internal `ha-slider`/`ha-control-slider` components, which is what let it
skip the touch/pointer/wheel handling `VolumeSliderController` needs in the
HA frontend source above — a native range input already fires real
`input`/`change` events for mouse, touch, and keyboard interaction on its
own.

## Configuration

The entity IDs above are configurable, the same way any standard Lovelace
card's `entity` field is — the defaults match what
`custom_components/gomac_pandora/media_player.py` and `haDiscovery.ts`
resolve to today, but nothing is hardcoded.

```yaml
type: custom:gomac-pandora-card
entity: media_player.pandora          # optional, this is the default
love_entity: button.pandora_love      # optional, this is the default
ban_entity: button.pandora_ban        # optional, this is the default
tired_entity: button.pandora_tired    # optional, this is the default
restart_entity: button.pandora_restart # optional, this is the default
```

## Installing on Scott's real Home Assistant instance

1. Copy the built card file onto the Home Assistant host, into its `www/`
   config directory (files there are served at `/local/...`):

   ```sh
   cp dist/gomac-pandora-card.js /path/to/homeassistant/config/www/gomac-pandora-card.js
   ```

2. Settings → **Dashboards** → the **⋮** (three-dot) menu top right →
   **Resources** → **Add Resource**:
   - URL: `/local/gomac-pandora-card.js`
   - Resource type: **JavaScript Module**

   (If "Resources" doesn't appear under that menu, enable Advanced Mode
   first: your user profile, bottom of the page, "Advanced Mode" toggle.)

3. Reload the dashboard (a full browser refresh is the reliable way to
   pick up a newly added resource).

4. Add the card to a view — either:
   - **UI editor**: Edit Dashboard → Add Card → search "GOMAC Pandora
     Card" (it registers itself in HA's card picker), or
   - **YAML mode**: Edit Dashboard → (top-right ⋮) → Edit in YAML, and add
     the block from "Configuration" above under that view's `cards:` list.

5. To update the card after a code change: rebuild (`npm run build`),
   re-copy `dist/gomac-pandora-card.js` to the same `www/` path, and bump
   the resource URL's cache-busting query string (e.g.
   `/local/gomac-pandora-card.js?v=2`) in Settings → Dashboards →
   Resources — browsers aggressively cache JS module resources by URL, so
   without this Scott's browser may keep running the old version after a
   plain file overwrite.

There is no HACS packaging here — this is a single self-contained file,
copied in manually like the daemon and the `gomac_pandora` integration
already are.

## Building from source

The bundled, committed output (`dist/gomac-pandora-card.js`) is usable as-is
with no build step. To rebuild it after a source change:

```sh
npm install
npm run build      # -> dist/gomac-pandora-card.js (single ESM file, lit inlined)
npm run typecheck
npm test
```

### Why this build setup

- **LitElement + TypeScript**, bundled with **esbuild** to one ESM file —
  the standard, idiomatic shape for a custom Lovelace card in this
  ecosystem (the same stack HA's own frontend and most community cards
  use). esbuild was picked over Rollup/webpack/Vite for this single-file
  library-style bundle because it needs zero configuration to produce one.
- **Built output is committed**, not just source, so the card is usable on
  Scott's HA instance without running any JS tooling there — matching how
  the daemon and Python integration are already deployed by direct file
  copy, no build step on the target machine.
- **No `home-assistant-js-websocket`/`custom-card-helpers` dependency** —
  `src/types.ts` defines the small local subset of `HomeAssistant`/
  `HassEntity` this card actually touches, rather than pulling in a
  dependency that tracks HA core's frontend release cycle for a handful of
  fields read off `hass.states[...]`.
- **Tests**: `vitest` with a `jsdom` environment. `test/debounce.test.ts`
  covers the debounce/cancel logic in isolation; `test/gomac-pandora-card.test.ts`
  mounts the real custom element (`document.createElement("gomac-pandora-card")`,
  a fake `hass` object, real DOM events dispatched at the shadow DOM) and
  asserts on the actual service calls made — including the debounce/
  release/anti-flash volume behavior above. `ha-card`/`ha-icon`/
  `ha-icon-button` render as plain unknown elements under jsdom (as they
  would in any browser before HA's frontend defines them) — that's fine
  here since none of this card's own logic depends on their internal
  behavior, only on the events dispatched at the elements this card
  controls directly (`<input type="range">`, `<select>`, and the
  `ha-icon-button` elements' own click handlers).

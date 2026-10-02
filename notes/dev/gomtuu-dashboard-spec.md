# Gomtuu Dashboard — Enhancement Spec

Living spec for planned changes to the telemetry dashboard
(`src/tools/gomtuu-dashboard/`). It's organized into **parts**. Each part is
a self-contained unit of work that can be handed to an implementing agent
on its own. A part is ready to implement only when its status says so.

This doc says **what** to build and **why**, plus the constraints and the
acceptance criteria. It deliberately doesn't prescribe the code. The
implementing agent owns implementation decisions within these requirements,
and should escalate anything that would change scope or contradict a stated
requirement rather than quietly working around it (see the root
`CLAUDE.md`).

| Part | Topic | Status |
|---|---|---|
| 1 | Live telemetry stream, gauge data contract, and `app.js` fixes | **Ready to implement** |
| 2 | Power gauge as a Vue / VitePress component | Planned: open decisions below |
| 3+ | Further changes | To be added |

## Background: how the dashboard works today

Read the package `README.md` first. In short:

- **Server** (`gomac-dashboard.service` on TheFlea, Node/TypeScript)
  subscribes to MQTT (Victron BLE, ping-monitor, phone GPS, pianobar state),
  polls Open-Meteo every 15 min, and keeps the current state in memory. It
  serves `GET /snapshot.json` plus the static frontend, on two loopback
  ports:
  - `8090`: position-redacted, published publicly with Tailscale Funnel.
  - `8091`: full snapshot, tailnet-only with Tailscale Serve.
- **Frontend** (`public/`: vanilla HTML/CSS/JS, no build step) is served by
  that server and also published to GitHub Pages
  (`https://www.scottkirvan.com/GOMAC/dashboard/`). `config.js` names the
  backend; `app.js` picks the tailnet URL if reachable, else the public one.
- **Update model:** `app.js` fetches the whole snapshot every 10 s and
  re-renders every panel from scratch.

That update model is fine for slow data (weather changes every 15 min) and
wrong for fast data. Victron readings reach the server many times a second,
roughly 12 MQTT messages/s across all devices, but the browser shows them
only every 10 s.

---

## Part 1 — Live telemetry stream

**Status: ready to implement.**

### Goal

The power readings that change second-to-second update in the browser in
near real time, about 4 times a second, without re-rendering the page. The
slow panels keep working as they do now.

### Decisions already made

- **Live push is an explicit requirement this time.** The dashboard
  originally shipped with a WebSocket push server, which was replaced by
  10 s polling because live updates hadn't actually been asked for (see
  `mistakes.md`, 2026-09-14). Scott has now asked for live updates for
  specific fields, after weighing the options (2026-10-02). This is a
  deliberate, scoped reversal for those fields only. Everything else stays
  on polling.
- **Transport: Server-Sent Events (SSE).**
  - The server already receives pushes from MQTT, so it only has to forward
    them.
  - SSE is plain HTTP: it works through Tailscale Serve and should work
    through Funnel (verify, see Risks), and it needs no new dependencies.
  - Browsers support it natively (`EventSource`), including automatic
    reconnect, which matters on a van's flaky WiFi.

  Rejected alternatives:
  - **Faster polling:** re-downloads the full snapshot whether or not
    anything changed.
  - **WebSockets:** bidirectional transport isn't needed. Revisit if the
    dashboard ever gets controls.
  - **Browser talks to MQTT directly over WebSockets:** would expose
    Mosquitto to browsers, including the public internet.
- **Live fields:**
  - battery current (A)
  - solar power (W)
  - battery voltage (V)
  - GPS speed and heading, on the **private port only**
- **Rate: 4 updates/second**, as a starting point to evaluate. It must be
  configurable, not hard-coded.

### Requirements

**Server**

1. **Stream endpoint** on both ports, alongside `/snapshot.json`, using the
   same CORS policy as `/snapshot.json` (wildcard origin: read-only, no
   auth, no cookies). The GitHub Pages copy is cross-origin and must be
   able to connect.
2. **Redaction applies to the stream too.** The public port's stream never
   carries position-derived fields (speed, heading, or anything else that
   reveals location). It's the same rule as `redactPositionForPublic`.
   Tests must cover it.
3. **Rate limiting with coalescing.**
   - The server emits at most N updates/s per connection. N is configurable
     by environment variable and defaults to 4.
   - Each emitted update carries the latest value of each live field. Never
     queue a backlog of stale intermediate values.
   - When nothing has changed since the last emit, it may skip sending.
4. **Freshness.** Each live value carries the time the server last received
   it, so the client can tell "steady reading" from "stale because the
   source went quiet" (for example, the BLE monitor stopped).
5. **Gauge scale values.** The values the gauge needs as scale/context are
   included in, or reachable from, the stream when they change: all-time
   solar peak, remaining Ah / SoC, charger state. These change rarely and
   don't need to be sent at 4 Hz. The agent decides how: a separate event
   type, inclusion only on change, or similar.
6. **Keep-alive.** The server sends periodic keep-alives so idle proxies
   (Tailscale, browsers on mobile networks) don't drop the connection.
7. **Connection hygiene.**
   - Disconnected clients are cleaned up promptly, with no leaked timers or
     listeners.
   - A small number of simultaneous viewers must stay negligible in
     CPU/memory on the Pi.
   - Behavior under a pathological number of connections should be bounded
     rather than unbounded. The agent picks the mechanism.
8. **Versioned event format.** The event payload format is documented in the
   package README and versioned, so a future consumer (Part 2's component,
   GOMAC hub, others) can rely on it.

**Frontend**

9. **Initial load is unchanged:** fetch the snapshot once so every panel
   renders immediately. Then open the stream.
10. **Targeted updates.** Live events update only the affected elements: the
    amp arc and reading, the solar ring and watts, voltage, and speed and
    heading. No full re-render on live events. Any smoothing or animation is
    the agent's call, but displayed values must not lag the stream
    noticeably.
11. **Slow data keeps polling** (weather, connectivity, sensor tables, now
    playing, history chart). The interval may be revisited but isn't
    required to change.
12. **Resilience.**
    - When the stream drops, the page keeps working on polling and the
      status badge says so. On reconnect, re-fetch the snapshot so nothing
      missed during the gap stays wrong.
    - If the stream can't be established at all (for example, a proxy
      buffers it), the page falls back to polling and behaves as it does
      today.
    - Stale live values (requirement 4) are visibly indicated rather than
      shown as current.
13. **Backend selection is re-evaluated after failures.** Today the
    tailnet-vs-public choice is made once at page load. A page opened on the
    tailnet keeps hitting the tailnet URL forever after Tailscale drops, and
    the reverse is true off the tailnet. After repeated failures, re-probe
    and switch.
14. **No overlapping polls.** The next poll starts only after the previous
    one finishes, so requests can't pile up on a slow link.

**Frontend fixes** (from the 2026-10-02 `app.js` review; independent of
streaming, but in scope for this part)

15. **The battery ring and its center number use the same source.** Today
    the ring fills from the BMV-712's SoC % while the center number ("195Ah")
    is `capacity − |consumed_ah|`. The two come from different measurements
    and can visibly disagree (one live example: 85.2 % vs 169 Ah of 200).
    Scott chose amp-hours as the readout, so the ring follows the number:
    fill = remaining Ah ÷ capacity. Fall back to SoC % only when
    `consumed_ah` isn't reported, flagged as an estimate as the number
    already is.
16. **Escape externally sourced text.** Song title, artist, album and
    station, Victron metric names and values, device identifiers, and the
    weather condition are currently inserted with `innerHTML` unescaped.
    Text containing `<` or `&` renders wrong, and it's poor practice on a
    page that's public. All such text must be rendered as text, not markup.
17. **Headers say what's on screen, not raw buffer sizes.** Panel headers
    show raw sample counts that misread as the visible window. For example,
    connectivity says "1500 samples" while its strip shows only the last 48
    (about 24 minutes). Headers should describe the span actually displayed
    (for example "last 24 min"), or be dropped where they add nothing.
18. **Sunrise and sunset use the van's timezone, not the viewer's.** Open-Meteo
    returns local times without an offset for the queried location, and the
    browser parses them in its own timezone. The sunrise/sunset labels and
    daylight progress bar are wrong whenever the viewer isn't in the van's
    timezone. Times must be interpreted in the location's timezone, which
    Open-Meteo can report alongside the forecast.

### The gauge data contract

Part 2 turns the power gauge into a reusable component, so Part 1 must
produce the data that component will consume. Define, in one place on the
client, a single **gauge state** shape that both the snapshot and live
events map into. Today's vanilla gauge renders from it, and the Part 2
component will take it as input. That's the de facto API of the future
component, so get it right here.

The gauge state covers at least:

- **Live values:** battery current (A, signed: positive = charging),
  solar power (W), battery voltage (V).
- **Context values:** remaining Ah, SoC %, charger state, all-time solar
  peak (W) and when it was set.
- **Scale / configuration:** pack capacity (Ah) and amp full scale
  (±A). Today these are constants in `app.js` (200 Ah and ±30 A). They're
  configuration, not code: the gauge must not assume a particular vehicle's
  battery or charger (GOMAC stays vehicle-agnostic). Where the configuration
  comes from (server config exposed in the snapshot, `config.js`, or
  component props) is the agent's call for Part 1. Note the choice in the
  README, since Part 2 builds on it.
- **Freshness:** the per-value received-at times from requirement 4.

Keep the shape presentation-agnostic. It describes the battery system, not
the DOM or the SVG geometry.

### Out of scope for Part 1

- Building the Vue component (Part 2).
- Making any panel other than the power gauge and position speed/heading
  live.
- Controls or any browser-to-server commands.
- Persisting live data. The 1-hour chart history and the all-time solar
  peak keep working as today.

### Risks and things to verify

- **Tailscale Funnel and SSE.** Confirm that Funnel passes the stream
  through without buffering: events should arrive at the configured rate
  when viewed through `:8443`, not in bursts. If it buffers, report back
  before working around it. Polling fallback (requirement 12) keeps the
  page usable meanwhile.
- **Source cadence is the real ceiling.** Each Victron device broadcasts
  roughly once a second or so, so 4 Hz may often re-send unchanged values.
  That's expected. Report what update rate is actually observed per field.
- **Mobile battery and data.** A stream at 4 Hz should cost on the order of
  hundreds of bytes per second. Confirm, and make sure a hidden or
  background tab doesn't hold a connection at full rate if that's easy to
  avoid.

### Acceptance criteria

- [ ] On the tailnet view, amps/solar/voltage visibly update about 4×/s;
      speed and heading update live when moving.
- [ ] On the public view (Funnel and the GitHub Pages copy), the same power
      fields update live, and **no position-derived data appears in the
      stream**, verified by inspecting the raw stream, not just the UI.
- [ ] Killing the network (or stopping the server) shows a degraded state;
      restoring it recovers without a page reload, and the snapshot is
      re-fetched.
- [ ] A stale source (stop `victron-ble-monitor`) is visibly flagged within
      a reasonable time.
- [ ] The rate is configurable by environment variable; 4 Hz is the default.
- [ ] The battery ring and center number agree (requirement 15).
- [ ] A song title or station containing `<b>&` displays literally,
      verified by publishing a test value to the relevant MQTT topic
      (requirement 16).
- [ ] No panel header shows a raw buffer size (requirement 17).
- [ ] Sunrise/sunset labels are correct when viewed with the browser set to
      a different timezone from the van's (requirement 18).
- [ ] The event format and the gauge state shape are documented in the
      package README.
- [ ] Unit tests cover coalescing/rate limiting, redaction of the public
      stream, and client cleanup on disconnect.
- [ ] Measured: observed per-field update rates and approximate bytes/s,
      reported in the PR.
- [ ] Deployed to TheFlea per the README's deploy steps after merge.

### Notes for the implementing agent

- **Previews:** the committed `public/config.js` points the page at the
  *production* backend. Previewing a branch with a local server shows new
  frontend code against production data unless `config.js` is blanked in
  the preview checkout. See the README's Deployment section.
  A whole debugging session was lost to this on 2026-10-01.
- **Production checkout:** `/home/scott/gomac-deploy` is what production
  runs from. Do feature work in a separate worktree.

---

## Part 2 — Power gauge as a Vue / VitePress component (planned)

**Status: planned. Not ready to implement until the open decisions below
are settled with Scott.**

### Goal

The three-ring power gauge (amps outer, battery middle, solar inner)
becomes a reusable Vue component. It can be embedded in VitePress pages on
the GOMAC docs site, and potentially reused by other GOMAC UIs.

### Known so far

- **Input:** the component consumes the **gauge state** defined in Part 1.
  The component should be presentational: given gauge state, it renders.
- **Data source:** fetching the snapshot and subscribing to the stream
  likely belongs in a separate piece the component doesn't own (for
  example, a composable that produces reactive gauge state). That would
  keep the component reusable with other data sources and easy to test
  with fixed data.
- **Static rendering:** VitePress pre-renders pages at build time. Anything
  that opens a connection or touches `window` must run client-side only.
- **Vehicle-agnostic:** capacity and amp full scale are inputs, not
  constants.

### Open decisions (for Scott)

1. **Where the component lives:**
   - in the dashboard package;
   - in the docs site's theme (`docs/.vitepress/theme`);
   - in a small shared package both consume.
2. **Whether the standalone dashboard moves to Vue.** Either it migrates to
   Vue with a build step and uses the component itself, or it stays
   vanilla, with the component used only in VitePress. Keeping both means
   two renderings of the same gauge to keep in sync.
3. **Which data-source variants to support:** the built-in live
   subscription, plain props for static/demo use, or both.
4. **Styling:** follow the VitePress theme's colors and light/dark mode, or
   keep the dashboard's own dark look regardless of where it's embedded.

---

## Known issues

From a review of `public/app.js` on 2026-10-02. All are now in scope for
Part 1.

| Issue | Where |
|---|---|
| Backend (tailnet vs public) is chosen once at page load and never re-evaluated | Part 1, req. 13 |
| Polls can overlap and stack up on a slow link (`setInterval` without waiting) | Part 1, req. 14 |
| Battery ring fills from SoC % while its center number comes from `consumed_ah`; the two can disagree | Part 1, req. 15 |
| Externally sourced text is inserted with `innerHTML` unescaped | Part 1, req. 16 |
| Panel headers show raw sample counts that misread as the visible window | Part 1, req. 17 |
| Sunrise/sunset are parsed in the viewer's timezone, not the van's | Part 1, req. 18 |

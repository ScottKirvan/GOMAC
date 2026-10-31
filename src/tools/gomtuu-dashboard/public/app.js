import {
  fmt,
  fmtSigned,
  formatAge,
  formatDuration,
  formatClock,
  polarPointFromTop,
  buildChartSvg,
  compassLabel,
  buildRttSparkline,
  googleMapsUrl,
  currentDirection,
  weatherIcon,
  forecastDayLabel,
  gradientArcSvg,
  easeToward,
  easeAngleToward,
  lockIconSvg,
  deviceCardHtml,
} from "./render.js";
import { gradientPair } from "./color.js";

/**
 * Shared concentric-ring dial geometry for the Current gauge: amp (outer) /
 * SOC (middle) / produced (inner), all centered on the same point; the
 * Charge and Draw gauges use the same radii (see FLOW_RINGS). Radii/stroke-widths are chosen
 * for even breathing room between all three rings at the current viewBox
 * size -- see public/index.html's <svg viewBox="0 0 128 128"> for the
 * matching static markup (track circles and the empty ring groups that
 * gradientArcSvg fills).
 */
const DIAL_CENTER = 64;
const SOC_RING_RADIUS = 47;
const SOC_RING_STROKE = 7;
const INNER_RING_RADIUS = 35;
const INNER_RING_STROKE = 6;
const AMP_RING_STROKE = 7;

/**
 * Gradient endpoints for each ring, derived from the theme's base colors
 * in style.css (see public/color.js gradientPair). Read once: the CSS
 * variables don't change at runtime.
 */
let ringGradients;
function getRingGradients() {
  if (!ringGradients) {
    const css = getComputedStyle(document.documentElement);
    const pairFor = (name) => {
      const value = css.getPropertyValue(name).trim();
      return /^#[0-9a-f]{6}$/i.test(value) ? gradientPair(value) : { start: value, end: value };
    };
    ringGradients = {
      charge: pairFor("--good"),
      draw: pairFor("--crit"),
      soc: pairFor("--battery"),
      produced: pairFor("--produced"),
      solarW: pairFor("--solar"),
      alternatorW: pairFor("--alternator"),
      shoreW: pairFor("--shore"),
      starlinkW: pairFor("--connectivity"),
      loadW: pairFor("--audio"),
      ghostW: pairFor("--ghost"),
    };
  }
  return ringGradients;
}

/**
 * Amp gauge geometry/scale. Deliberately a named constant, not a magic
 * number buried in the arc math below -- Scott's observed real-world peaks
 * are ~30A on both draw and charge, but that's a starting point to tune,
 * not a hard spec. +-AMP_GAUGE_FULL_SCALE_A maps to a full 360 degree fill.
 */
const AMP_GAUGE_FULL_SCALE_A = 30;
const AMP_GAUGE_CENTER = DIAL_CENTER;
const AMP_GAUGE_RADIUS = 58;

/**
 * Battery pack nominal capacity, used to convert the BMV-712's hardware
 * consumed_ah reading into the SOC ring's "Ah remaining" center readout.
 * A named, tunable constant like AMP_GAUGE_FULL_SCALE_A above -- this is
 * Scott's stated assumption for his system, not a value read off the
 * device itself (the BMV-712 has its own internally configured capacity
 * setting, which this may not exactly match -- see renderPowerGauge).
 */
const BATTERY_CAPACITY_AH = 200;

/** Full scale of the Current gauge's inner ring: energy produced by all charge sources today. */
const PRODUCED_FULL_SCALE_WH = 1000;

/**
 * Charge and Draw gauge rings, outer to inner, each full at its device's
 * rated maximum at ~14.4 V (Starlink Mini's typical maximum; the ghost
 * load's scale was picked from a day's history). Rings aren't comparable
 * with each other by eye: the watts are in each key entry's tooltip.
 */
const FLOW_RINGS = [
  { key: "solarW", label: "Solar", group: "chargeSolarRing", keyEl: "keySolar", r: 58, stroke: 7, fullW: 215 },
  { key: "alternatorW", label: "Alternator", group: "chargeAlternatorRing", keyEl: "keyAlternator", r: 47, stroke: 7, fullW: 430 },
  { key: "shoreW", label: "Shore", group: "chargeShoreRing", keyEl: "keyShore", r: 35, stroke: 6, fullW: 215 },
  { key: "starlinkW", label: "Starlink", group: "drawStarlinkRing", keyEl: "keyStarlink", r: 58, stroke: 7, fullW: 40 },
  { key: "loadW", label: "Load output", group: "drawLoadRing", keyEl: "keyLoad", r: 47, stroke: 7, fullW: 215 },
  { key: "ghostW", label: "Ghost load", group: "drawGhostRing", keyEl: "keyGhost", r: 35, stroke: 6, fullW: 260 },
];
const FLOW_KEYS = [...FLOW_RINGS.map((ring) => ring.key), "starlinkPeakW"];
const STARLINK_RING = FLOW_RINGS.find((ring) => ring.key === "starlinkW");

function ringSvg(r, stroke, fraction, gradient) {
  const clamped = Math.min(1, Math.max(0, fraction ?? 0));
  return gradientArcSvg({ cx: DIAL_CENTER, cy: DIAL_CENTER, r, strokeWidth: stroke, extentDeg: clamped * 360, ...gradient });
}

function energyText(wh) {
  return wh >= 1000 ? `${(wh / 1000).toFixed(2)} kWh` : `${Math.round(wh)} Wh`;
}

function renderPowerGauge(power, chart) {
  const soc = power.soc;
  const socPct = soc === undefined ? 0 : Math.min(100, Math.max(0, soc));
  const gradients = getRingGradients();
  document.getElementById("socRing").innerHTML = gradientArcSvg({
    cx: DIAL_CENTER, cy: DIAL_CENTER, r: SOC_RING_RADIUS, strokeWidth: SOC_RING_STROKE,
    extentDeg: (socPct / 100) * 360, ...gradients.soc,
  });

  /**
   * Ah remaining is derived from the BMV-712's own consumed_ah reading
   * (Victron's negative-since-full convention -- e.g. -31.0 means 31Ah
   * drawn since the last full charge), not from soc% * capacity: the two
   * can disagree. Confirmed live: soc=85.2% would naively imply 170.4Ah
   * of a 200Ah pack, but consumed_ah=-31.0 against the same 200Ah
   * assumption gives 169Ah -- because the BMV-712's own internally
   * configured capacity setting isn't necessarily exactly
   * BATTERY_CAPACITY_AH. consumed_ah is the more faithful source for
   * "Ah left out of a 200Ah pack" as Scott defined it.
   *
   * Falls back to the soc%-derived estimate (flagged as such in the
   * tooltip) only if consumed_ah itself isn't being reported -- still
   * shows a number rather than going blank, since soc is otherwise
   * present whenever this dial has anything to render at all.
   */
  const consumedAh = power.consumedAh;
  let remainingAh;
  let remainingAhIsEstimate = false;
  if (consumedAh !== undefined && !Number.isNaN(consumedAh)) {
    remainingAh = BATTERY_CAPACITY_AH - Math.abs(consumedAh);
  } else if (soc !== undefined) {
    remainingAh = (socPct / 100) * BATTERY_CAPACITY_AH;
    remainingAhIsEstimate = true;
  }

  const socNum = document.getElementById("socNum");
  if (remainingAh === undefined) {
    socNum.textContent = "—";
    socNum.title = "";
  } else {
    const clampedAh = Math.min(BATTERY_CAPACITY_AH, Math.max(0, remainingAh));
    socNum.textContent = `${Math.round(clampedAh)}Ah`;
    socNum.title = remainingAhIsEstimate
      ? `Estimated as ${Math.round(soc)}% of a ${BATTERY_CAPACITY_AH}Ah nominal pack -- the battery monitor isn't reporting consumed_ah right now, which is the more accurate source this normally uses.`
      : `${BATTERY_CAPACITY_AH}Ah nominal capacity minus ${Math.abs(consumedAh).toFixed(1)}Ah consumed since last full charge (consumed_ah).`;
  }

  document.getElementById("keySoc").title = soc === undefined ? "State of charge" : `State of charge: ${fmt(soc, 1, "%")}`;

  const samples = chart?.samples ?? [];
  const hasProduced = samples.some((s) => s.producedWh !== undefined);
  const producedWh = samples.reduce((sum, s) => sum + (s.producedWh ?? 0), 0);
  document.getElementById("producedRing").innerHTML = ringSvg(INNER_RING_RADIUS, INNER_RING_STROKE, producedWh / PRODUCED_FULL_SCALE_WH, gradients.produced);
  document.getElementById("producedSub").textContent = hasProduced ? energyText(producedWh) : "—";
  document.getElementById("keyProduced").title =
    `Produced by solar, alternator and shore since an hour before sunrise, including what went straight to loads: ${energyText(producedWh)} of ${energyText(PRODUCED_FULL_SCALE_WH)} full scale`;

  const sourceEl = document.getElementById("powerSourceMac");
  const sourceName = power.batteryDeviceName ?? power.batteryDeviceMac ?? "no data yet";
  sourceEl.textContent = power.batteryOnline === false ? `${sourceName} · offline` : sourceName;
  sourceEl.classList.toggle("offline-label", power.batteryOnline === false);
  sourceEl.title = [power.batteryDeviceName ? power.batteryDeviceMac : "", power.batteryOnline === false ? "Battery monitor offline: showing its last values." : ""].filter(Boolean).join(" · ");
}

/**
 * Bidirectional amp gauge: 0A sits at top dead center with an empty bar.
 * Charge (positive current) fills clockwise in green; draw/discharge
 * (negative current) fills counter-clockwise in red. +-AMP_GAUGE_FULL_SCALE_A
 * is a full 360 degree fill. This is now the outermost of the three
 * concentric dial rings (amp / SOC / produced), sharing one center with
 * renderPowerGauge's rings -- see DIAL_CENTER / AMP_GAUGE_RADIUS above.
 * Values beyond full scale are capped visually at 100% (not wrapped) but a
 * small pulsing dot marks the pegged end of the bar so the overflow is
 * obvious -- the live numeric amp reading in the dial center is always the
 * real, uncapped value regardless of pegging.
 */
function renderAmpGauge(current) {
  const arc = document.getElementById("ampArc");
  const overflowDot = document.getElementById("ampOverflowDot");
  const reading = document.getElementById("ampReading");

  const direction = currentDirection(current);
  reading.textContent = fmtSigned(current, 1, " A");
  reading.classList.remove("is-charge", "is-draw");
  if (direction) reading.classList.add(`is-${direction}`);
  reading.title = direction === "charge" ? "charging" : direction === "draw" ? "drawing" : "";
  document.getElementById("keyAmps").title = `Battery current: ${fmtSigned(current, 1, " A")} of ±${AMP_GAUGE_FULL_SCALE_A} A full scale`;

  if (!direction) {
    arc.innerHTML = "";
    arc.classList.remove("amp-arc-overflow");
    overflowDot.setAttribute("r", "0");
    return;
  }

  const magnitude = Math.abs(current);
  const pct = Math.min(1, magnitude / AMP_GAUGE_FULL_SCALE_A);
  const overflowing = magnitude > AMP_GAUGE_FULL_SCALE_A;
  const extent = (direction === "charge" ? 1 : -1) * pct * 360;
  const gradient = getRingGradients()[direction];

  arc.innerHTML = gradientArcSvg({
    cx: AMP_GAUGE_CENTER, cy: AMP_GAUGE_CENTER, r: AMP_GAUGE_RADIUS, strokeWidth: AMP_RING_STROKE,
    extentDeg: extent, ...gradient,
  });
  arc.classList.toggle("amp-arc-overflow", overflowing);

  if (overflowing) {
    const tip = polarPointFromTop(AMP_GAUGE_CENTER, AMP_GAUGE_CENTER, AMP_GAUGE_RADIUS, extent);
    overflowDot.setAttribute("cx", tip.x.toFixed(3));
    overflowDot.setAttribute("cy", tip.y.toFixed(3));
    overflowDot.setAttribute("fill", gradient.end);
    overflowDot.setAttribute("r", "3.5");
    reading.title = `${reading.title}, pegged — exceeds the ±${AMP_GAUGE_FULL_SCALE_A}A gauge scale`;
  } else {
    overflowDot.setAttribute("r", "0");
  }
}

function sumOrUndefined(values) {
  return values.some((v) => v === undefined) ? undefined : values.reduce((a, b) => a + b, 0);
}

function renderFlowGauges(shown, ghostEstimated) {
  const gradients = getRingGradients();
  for (const ring of FLOW_RINGS) {
    const w = shown[ring.key];
    document.getElementById(ring.group).innerHTML = ringSvg(ring.r, ring.stroke, w === undefined ? 0 : w / ring.fullW, gradients[ring.key]);
    const estimate = ring.key === "ghostW" && ghostEstimated ? ", estimated: held from before the Orion started charging" : "";
    const inferred = ring.key === "alternatorW" ? ", inferred from the battery balance" : "";
    document.getElementById(ring.keyEl).title = `${ring.label}: ${fmt(w, 0, " W")} of ${ring.fullW} W full scale${inferred}${estimate}`;
  }

  const peakDot = document.getElementById("starlinkPeakDot");
  if (shown.starlinkPeakW === undefined) {
    peakDot.setAttribute("r", "0");
  } else {
    const at = polarPointFromTop(DIAL_CENTER, DIAL_CENTER, STARLINK_RING.r, Math.min(1, shown.starlinkPeakW / STARLINK_RING.fullW) * 360);
    peakDot.setAttribute("cx", at.x.toFixed(3));
    peakDot.setAttribute("cy", at.y.toFixed(3));
    peakDot.setAttribute("r", "3");
    peakDot.setAttribute("fill", gradients.starlinkW.end);
  }
  document.getElementById("keyStarlink").title += shown.starlinkPeakW === undefined ? "" : `, peak ${fmt(shown.starlinkPeakW, 0, " W")} in the last 2 minutes (dot)`;

  const chargeW = sumOrUndefined([shown.solarW, shown.alternatorW, shown.shoreW]);
  const drawW = sumOrUndefined([shown.starlinkW, shown.loadW, shown.ghostW]);
  document.getElementById("chargeTotal").textContent = chargeW === undefined ? "—" : `${Math.round(chargeW)}W`;
  document.getElementById("drawTotal").textContent = drawW === undefined ? "—" : `${Math.round(drawW)}W`;
  document.getElementById("ghostTrack").classList.toggle("is-estimate", ghostEstimated === true);
  const ghostSub = document.getElementById("ghostSub");
  ghostSub.textContent = shown.ghostW === undefined ? "—" : `ghost ${ghostEstimated ? "~" : ""}${Math.round(shown.ghostW)}W`;
  ghostSub.title = ghostEstimated ? "Estimated: the ghost load can't be worked out while the Orion charges, so this is the last value from before it started." : "Unmeasured loads: what the battery balance can't account for.";
}

function renderMotion(speedMps, courseDeg) {
  const speedEl = document.getElementById("posSpeed");
  if (!speedEl) return;
  const mph = speedMps !== undefined ? speedMps * 2.23694 : undefined;
  speedEl.textContent = mph === undefined ? "—" : Math.round(mph);
  document.getElementById("posHeading").textContent =
    `heading ${courseDeg === undefined ? "—" : `${Math.round(courseDeg)}° ${compassLabel(courseDeg)}`}${mph !== undefined && mph > 1 ? " · moving" : ""}`;
  const needle = document.getElementById("posNeedle");
  needle.style.display = courseDeg === undefined ? "none" : "";
  if (courseDeg !== undefined) needle.setAttribute("transform", `rotate(${courseDeg.toFixed(1)} 32 32)`);
}

/**
 * Fast-changing readings shown with smoothing. Targets come from the live
 * stream while it's connected, and from each snapshot poll otherwise.
 * Displayed values ease toward their targets (EASE_TAU_MS) at up to
 * MAX_FRAME_RATE, and the animation stops once everything has settled.
 */
const LIVE_KEYS = ["current", "speedMps", "courseDeg", ...FLOW_KEYS];
const SETTLE_EPSILON = { current: 0.01, speedMps: 0.01, courseDeg: 0.1, ...Object.fromEntries(FLOW_KEYS.map((key) => [key, 0.2])) };
const EASE_TAU_MS = 120;
const MIN_FRAME_MS = 1000 / 30;
const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

const live = { streaming: false, targets: {}, shown: {}, ghostEstimated: false, frame: undefined, lastFrameAt: 0 };

function renderLiveFields() {
  const { shown } = live;
  renderAmpGauge(shown.current);
  renderFlowGauges(shown, live.ghostEstimated);
  renderMotion(shown.speedMps, shown.courseDeg);
}

function isSettled(key) {
  const { shown, targets } = live;
  if (shown[key] === undefined || targets[key] === undefined) return shown[key] === targets[key];
  const gap = key === "courseDeg" ? Math.abs(((targets[key] - shown[key] + 540) % 360) - 180) : Math.abs(targets[key] - shown[key]);
  return gap < SETTLE_EPSILON[key];
}

function animateLive(now) {
  const dt = now - live.lastFrameAt;
  if (dt < MIN_FRAME_MS) {
    live.frame = requestAnimationFrame(animateLive);
    return;
  }
  live.lastFrameAt = now;
  for (const key of LIVE_KEYS) {
    const ease = key === "courseDeg" ? easeAngleToward : easeToward;
    live.shown[key] = isSettled(key) ? live.targets[key] : ease(live.shown[key], live.targets[key], dt, EASE_TAU_MS);
  }
  const settled = LIVE_KEYS.every(isSettled);
  if (settled) Object.assign(live.shown, live.targets);
  renderLiveFields();
  live.frame = settled ? undefined : requestAnimationFrame(animateLive);
}

function setLiveTargets(values) {
  for (const key of LIVE_KEYS) live.targets[key] = values[key];
  if (prefersReducedMotion || document.hidden) {
    Object.assign(live.shown, live.targets);
    renderLiveFields();
    return;
  }
  if (live.frame === undefined) {
    live.lastFrameAt = performance.now();
    live.frame = requestAnimationFrame(animateLive);
  }
}

function renderChart(victron, serverTime) {
  // A server from before the daylight window sends a one-hour `history` instead of `chart`.
  const chart = victron.chart ?? {
    start: victron.history?.[0]?.t ?? serverTime,
    end: victron.history?.at(-1)?.t ?? serverTime,
    samples: victron.history ?? [],
  };
  const el = document.getElementById("powerChart");
  const svg = buildChartSvg(chart, victron.solarPeak?.watts, serverTime);
  el.innerHTML = svg ?? `<div class="chart-empty">collecting data — check back once a few readings have come in</div>`;
  const span = (ms) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  document.getElementById("historyMeta").textContent = `${span(chart.start)} – ${chart.end >= serverTime - 60_000 ? "now" : span(chart.end)}`;
}

function renderSensorTables(devices) {
  const container = document.getElementById("sensorTables");
  const macs = Object.keys(devices);
  if (macs.length === 0) {
    container.innerHTML = `<div class="panel"><div class="empty-state">no Victron devices seen yet — waiting for victron-ble-monitor.py's next publish cycle</div></div>`;
    return;
  }

  container.innerHTML = macs.map((mac) => deviceCardHtml(mac, devices[mac], isCardOpen(mac))).join("");
}

const CARD_OPEN_KEY_PREFIX = "gomac.deviceCard.open.";

function isCardOpen(mac) {
  try {
    return localStorage.getItem(CARD_OPEN_KEY_PREFIX + mac) === "1";
  } catch {
    return false;
  }
}

// The cards are re-rendered on every update, so the stored choice is what
// keeps them open.
document.getElementById("sensorTables").addEventListener("click", (event) => {
  const toggle = event.target.closest?.(".dc-toggle");
  if (!toggle) return;
  const open = toggle.getAttribute("aria-expanded") !== "true";
  toggle.setAttribute("aria-expanded", String(open));
  toggle.closest(".device-card").querySelector(".dc-more").hidden = !open;
  try {
    if (open) localStorage.setItem(CARD_OPEN_KEY_PREFIX + toggle.dataset.mac, "1");
    else localStorage.removeItem(CARD_OPEN_KEY_PREFIX + toggle.dataset.mac);
  } catch {
    // Storage unavailable (private window, blocked site data): cards just start collapsed.
  }
});

function renderNowPlaying(np) {
  const el = document.getElementById("nowPlaying");
  if (!np.title) {
    el.innerHTML = `<div class="empty-state">nothing playing right now</div>`;
    return;
  }

  const pct =
    np.songDurationMs && np.songPlayedMs ? Math.min(100, (np.songPlayedMs / np.songDurationMs) * 100) : 0;

  el.innerHTML = `
    <div class="np-art"></div>
    <span class="np-live"><span class="dot"></span>on air</span>
    <div class="np-track">
      <div class="np-title">${np.title}</div>
      <div class="np-artist">${[np.artist, np.album].filter(Boolean).join(" · ")}</div>
    </div>
    <div class="np-fields">
      <span><span class="k">Station</span><span class="v">${np.station ?? "—"}</span></span>
      <span><span class="k">Rating</span><span class="v">${np.rating ?? "—"}</span></span>
    </div>
    <div class="np-progress">
      <span>${formatClock(np.songPlayedMs)}</span>
      <div class="np-bar"><div class="np-bar-fill" style="width:${pct}%"></div></div>
      <span>${formatClock(np.songDurationMs)}</span>
    </div>
  `;
}

function renderPosition(position) {
  const body = document.getElementById("positionBody");
  const hasFix = position.latitude !== undefined && position.longitude !== undefined;

  if (!hasFix) {
    body.innerHTML = `<div class="empty-state">no GPS fix yet</div>`;
    document.getElementById("positionMeta").textContent = "no fix yet";
    return;
  }

  // Speed and heading are filled in by renderMotion, from the smoothed live values.
  body.innerHTML = `
    <div class="pos-top">
      <svg class="pos-compass" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1.5" />
        <text x="32" y="10" text-anchor="middle" class="chart-axis-label">N</text>
        <g id="posNeedle" style="display:none">
          <line x1="32" y1="32" x2="32" y2="10" stroke="var(--position)" stroke-width="2.5" stroke-linecap="round" />
          <circle cx="32" cy="32" r="3" fill="var(--position)" />
        </g>
      </svg>
      <div class="pos-stats">
        <div class="pos-big"><span id="posSpeed" class="num">—</span><span class="unit">mph</span></div>
        <div id="posHeading" class="pos-sub"></div>
      </div>
    </div>
    <div id="posCoords" class="pos-coords mono"></div>
  `;
  renderCoords(position);
  renderMotion(live.shown.speedMps, live.shown.courseDeg);
  document.getElementById("positionMeta").textContent = position.coarse ? "phone GPS · approximate" : "phone GPS";
}

/** The public view gets coordinates rounded to 1 decimal place (~11 km), shown as approximate. */
function renderCoords(position) {
  const el = document.getElementById("posCoords");
  if (!el || position.latitude === undefined || position.longitude === undefined) return;
  const digits = position.coarse ? 1 : 4;
  const coords = `${position.coarse ? "≈ " : ""}${position.latitude.toFixed(digits)}°, ${position.longitude.toFixed(digits)}°`;
  const title = position.coarse ? "Approximate location (about 11 km). Open in Google Maps" : "Open in Google Maps";
  el.innerHTML = `<a class="pos-map-link" href="${googleMapsUrl(position.latitude, position.longitude)}" target="_blank" rel="noopener noreferrer" title="${title}">${coords} ↗</a>${position.accuracyM !== undefined ? ` ±${Math.round(position.accuracyM)}m` : ""}${position.updatedAt !== undefined ? ` · fix ${formatAge(position.updatedAt)}` : ""}`;
}

function renderConnectivity(connectivity) {
  const body = document.getElementById("connectivityBody");
  const { targets, summary, history } = connectivity;
  const targetNames = Object.keys(targets);

  document.getElementById("connectivityMeta").textContent = `${history.length} sample${history.length === 1 ? "" : "s"}`;

  if (targetNames.length === 0) {
    body.innerHTML = `<div class="empty-state">no ping-monitor data seen yet</div>`;
    return;
  }

  const cells = history
    .slice(-48)
    .map((s) => {
      const cls = s.successPct === undefined ? "" : s.successPct >= 90 ? "" : s.successPct >= 50 ? "warn" : "crit";
      return `<div class="conn-cell ${cls}"></div>`;
    })
    .join("");

  const rttSvg = buildRttSparkline(history);
  const rttNow = targetNames
    .map((name) => targets[name].rttMs)
    .filter((v) => v !== undefined)
    .reduce((sum, v, _, arr) => sum + v / arr.length, 0);

  const targetPills = targetNames
    .map((name) => {
      const t = targets[name];
      const cls = t.success === undefined ? "warn" : t.success ? "good" : "crit";
      const rtt = t.rttMs !== undefined ? ` ${Math.round(t.rttMs)}ms` : "";
      return `<span class="status-pill ${cls}"><span class="dot"></span>${name}${rtt}</span>`;
    })
    .join("");

  body.innerHTML = `
    ${cells ? `<div class="conn-strip">${cells}</div><div class="conn-labels"><span>oldest shown</span><span>now</span></div>` : `<div class="empty-state">collecting history…</div>`}
    <div class="conn-rtt-row">
      ${rttSvg ?? ""}
      <div class="conn-rtt-meta">
        ${summary.successPct !== undefined ? `success <span class="v">${summary.successPct.toFixed(0)}%</span>` : ""}
        ${rttNow ? ` · rtt <span class="v">${Math.round(rttNow)}ms</span>` : ""}
      </div>
    </div>
    <div class="conn-targets">${targetPills}</div>
  `;
}

function renderWeather(weather) {
  const body = document.getElementById("weatherBody");
  const meta = document.getElementById("weatherMeta");

  if (weather.temperatureC === undefined) {
    body.innerHTML = `<div class="empty-state">no weather data yet</div>`;
    meta.textContent = "no data yet";
    return;
  }

  meta.textContent = `updated ${formatAge(weather.updatedAt)}`;

  let barSection = "";
  // Open-Meteo's timezone=auto returns naive local-time strings for the
  // queried location; the browser parses them in ITS OWN local timezone,
  // so this drifts if the dashboard is viewed from a different timezone
  // than Gomtuu is currently in. Acceptable for now -- same person near
  // the van in the common case -- not worth the extra complexity yet.
  if (weather.sunrise && weather.sunset) {
    const sunrise = new Date(weather.sunrise);
    const sunset = new Date(weather.sunset);
    const now = new Date();
    const totalMs = sunset - sunrise;
    const pct = Math.min(100, Math.max(0, ((now - sunrise) / totalMs) * 100));
    const sunriseLabel = sunrise.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const sunsetLabel = sunset.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

    let note;
    if (now < sunrise) {
      note = `before sunrise — ${formatDuration(sunrise - now)} to go`;
    } else if (now > sunset) {
      note = "after sunset";
    } else {
      note = `daylight ${pct.toFixed(0)}% elapsed · ${formatDuration(sunset - now)} to sunset`;
    }

    barSection = `
      <div class="wx-bar-row">
        <span>${sunriseLabel}</span>
        <div class="wx-bar"><div class="wx-bar-fill" style="width:${pct}%"></div><div class="wx-bar-dot" style="left:${pct}%"></div></div>
        <span>${sunsetLabel}</span>
      </div>
      <div class="wx-note">${note}</div>
    `;
  }

  body.innerHTML = `
    <div class="wx-top">
      <span class="wx-icon" aria-hidden="true">${weatherIcon(weather.conditionCode)}</span>
      <span class="wx-temp">${Math.round(weather.temperatureC)}°C</span>
      <div class="wx-top-text">
        <span class="wx-cond">${weather.condition ?? "—"}</span>
        ${weather.apparentTemperatureC !== undefined ? `<span class="wx-feels">feels ${Math.round(weather.apparentTemperatureC)}°</span>` : ""}
      </div>
    </div>
    ${renderWind(weather)}
    ${barSection}
    ${renderForecast(weather.forecast)}
  `;
}

function renderWind(weather) {
  if (weather.windSpeedKph === undefined) return "";
  const dir = weather.windDirectionDeg;
  // Open-Meteo reports where the wind blows FROM; the arrow points where it's going.
  const arrow =
    dir === undefined
      ? ""
      : `<svg class="wx-wind-arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2 L12 13 L8 10.5 L4 13 Z" fill="currentColor" transform="rotate(${(dir + 180) % 360} 8 8)" /></svg>`;
  const from = dir === undefined ? "" : ` from ${compassLabel(dir)}`;
  const gusts = weather.windGustKph === undefined ? "" : ` · gusts ${Math.round(weather.windGustKph)}`;
  return `
    <div class="wx-wind" title="${dir === undefined ? "" : `${Math.round(dir)}°`}">
      ${arrow}<span>Wind <span class="v">${Math.round(weather.windSpeedKph)}</span> km/h${from}${gusts}</span>
    </div>
  `;
}

function renderForecast(forecast) {
  if (!forecast || forecast.length === 0) return "";
  const days = forecast
    .map(
      (day, i) => `
        <div class="wx-day" title="${day.condition ?? ""}">
          <span class="wx-day-name">${forecastDayLabel(day.date, i)}</span>
          <span class="wx-day-icon" aria-hidden="true">${weatherIcon(day.conditionCode)}</span>
          <span class="wx-day-temps"><span class="hi">${fmt(day.highC, 0, "°")}</span> <span class="lo">${fmt(day.lowC, 0, "°")}</span></span>
          <span class="wx-day-precip">${day.precipitationChancePct === undefined ? "" : `${Math.round(day.precipitationChancePct)}%`}</span>
        </div>`,
    )
    .join("");
  return `<div class="wx-forecast">${days}</div>`;
}

function render(snapshot) {
  live.lastSnapshotPosition = live.streaming ? { ...snapshot.position, ...definedOnly(live.position) } : snapshot.position;
  if (!live.streaming) {
    const { power, flows } = snapshot.victron;
    live.ghostEstimated = flows?.ghostEstimated === true;
    setLiveTargets({ current: power.current, ...flows, speedMps: snapshot.position.speedMps, courseDeg: snapshot.position.courseDeg });
  }
  renderPowerGauge(snapshot.victron.power, snapshot.victron.chart);
  renderChart(snapshot.victron, snapshot.serverTime);
  renderSensorTables(snapshot.victron.devices);
  renderNowPlaying(snapshot.nowPlaying);
  renderPosition(live.lastSnapshotPosition);
  renderConnectivity(snapshot.connectivity);
  renderWeather(snapshot.weather);

  renderClock(snapshot.serverTime);
  renderLiveFields();
  document.getElementById("footerNote").textContent = live.streaming
    ? "live readings streaming, everything else polled every 10s, weather via Open-Meteo"
    : "polling /snapshot.json every 10s, weather via Open-Meteo";
}

/** The header clock shows the server time of the newest data received, from a snapshot or a live event. */
let latestServerTime = 0;
function renderClock(serverTime) {
  if (serverTime === undefined || serverTime < latestServerTime) return;
  latestServerTime = serverTime;
  document.getElementById("serverTime").textContent = new Date(serverTime).toLocaleTimeString();
}

function definedOnly(obj) {
  return Object.fromEntries(Object.entries(obj ?? {}).filter(([, v]) => v !== undefined));
}

const POLL_INTERVAL_MS = 10000;
const PROBE_TIMEOUT_MS = 3000;

function setConnState(state) {
  const el = document.getElementById("connState");
  el.className = "badge";
  if (state === "live") {
    el.textContent = live.streaming ? "live · streaming" : "live";
    el.title = live.streaming ? "Power and motion readings update as they change" : "Readings refresh every 10 seconds";
    el.classList.add("ok");
  } else if (state === "connecting") {
    el.textContent = "connecting…";
  } else {
    el.textContent = "unreachable — retrying";
    el.classList.add("err");
  }
}

/**
 * Whether the tailnet-only address (full data, real position) answers.
 * With no timeout the request can wait as long as the browser needs:
 * Chrome holds requests from a public page to a private-network address
 * (tailnet addresses count) behind a "connect to devices on your local
 * network" permission prompt, so a short timeout would give up while the
 * prompt is still on screen.
 */
async function tailnetAnswers(privateBase, timeoutMs) {
  const controller = new AbortController();
  const timeout = timeoutMs === undefined ? undefined : setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${privateBase}/snapshot.json`, { cache: "no-store", signal: controller.signal });
    return res.ok;
  } catch {
    // Not reachable: not on the tailnet, or the browser's local-network
    // permission isn't granted. Expected for most visitors, not an error.
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Picks the backend at startup: the tailnet address if it answers within
 * PROBE_TIMEOUT_MS, otherwise the public one. In the second case it keeps
 * trying the tailnet address in the background and switches over when it
 * answers. When neither is configured (running locally on TheFlea, or
 * `npm run dev`), same-origin is already correct and there's nothing to probe.
 */
async function resolveApiBase() {
  const privateBase = window.GOMAC_API_BASE_PRIVATE;
  const publicBase = window.GOMAC_API_BASE_PUBLIC;
  if (!privateBase && !publicBase) {
    return { base: "", network: "local" };
  }
  if (!privateBase) {
    return { base: publicBase, network: "public" };
  }
  if (!publicBase || (await tailnetAnswers(privateBase, PROBE_TIMEOUT_MS))) {
    return { base: privateBase, network: "tailnet" };
  }
  return { base: publicBase, network: "public" };
}

let tailnetRetryInFlight = false;
async function retryTailnetInBackground() {
  const privateBase = window.GOMAC_API_BASE_PRIVATE;
  if (network !== "public" || !privateBase || tailnetRetryInFlight) return;
  tailnetRetryInFlight = true;
  const answered = await tailnetAnswers(privateBase);
  tailnetRetryInFlight = false;
  if (!answered || network !== "public") return;
  apiBase = privateBase;
  setNetwork("tailnet");
  closeStream();
  await poll();
  openStream();
}

function setNetwork(next) {
  network = next;
  const el = document.getElementById("netLock");
  el.hidden = next === "local";
  el.classList.toggle("tailnet", next === "tailnet");
  el.innerHTML = lockIconSvg(next === "tailnet");
  el.title =
    next === "tailnet"
      ? "On the tailnet: full data, including exact position"
      : "Public view: position is approximate. On the tailnet? Your browser may need permission to connect to devices on your local network.";
}

let apiBase = "";
let network = "local";

async function poll() {
  try {
    const res = await fetch(`${apiBase}/snapshot.json`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    render(await res.json());
    setConnState("live");
  } catch (err) {
    console.error("failed to fetch dashboard snapshot", err);
    setConnState("disconnected");
  }
}

/**
 * Live stream of the fast-changing readings (server's /stream). Closed
 * while the page is hidden to save the van's uplink. EventSource reconnects
 * on its own after a dropped connection; if the server refuses outright
 * (e.g. at its connection cap), retry after STREAM_RETRY_MS. Polling keeps
 * running throughout, so the page never depends on the stream.
 */
const STREAM_RETRY_MS = 60_000;
let eventSource;
let streamRetryTimer;

function setStreaming(streaming) {
  if (live.streaming === streaming) return;
  live.streaming = streaming;
  if (document.getElementById("connState").classList.contains("ok")) setConnState("live");
}

function openStream() {
  if (eventSource || document.hidden || typeof EventSource === "undefined") return;
  const es = new EventSource(`${apiBase}/stream`);
  eventSource = es;
  es.addEventListener("live", (event) => {
    const update = JSON.parse(event.data);
    if (update.v !== 1) return;
    setStreaming(true);
    renderClock(update.t);
    live.position = update.position;
    live.ghostEstimated = update.flows?.ghostEstimated === true;
    setLiveTargets({ current: update.power.current, ...update.flows, speedMps: update.position.speedMps, courseDeg: update.position.courseDeg });
    const { latitude, longitude } = update.position;
    if (latitude !== live.lastSnapshotPosition?.latitude || longitude !== live.lastSnapshotPosition?.longitude) {
      live.lastSnapshotPosition = { ...live.lastSnapshotPosition, ...definedOnly(update.position) };
      renderCoords(live.lastSnapshotPosition);
    }
  });
  es.addEventListener("error", () => {
    setStreaming(false);
    if (es.readyState === EventSource.CLOSED) {
      eventSource = undefined;
      clearTimeout(streamRetryTimer);
      streamRetryTimer = setTimeout(openStream, STREAM_RETRY_MS);
    }
  });
}

function closeStream() {
  clearTimeout(streamRetryTimer);
  eventSource?.close();
  eventSource = undefined;
  setStreaming(false);
}

async function start() {
  setConnState("connecting");
  const resolved = await resolveApiBase();
  apiBase = resolved.base;
  setNetwork(resolved.network);
  await poll();
  void retryTailnetInBackground();
  setInterval(poll, POLL_INTERVAL_MS);
  openStream();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      closeStream();
    } else {
      poll();
      openStream();
      void retryTailnetInBackground();
    }
  });
}

start();

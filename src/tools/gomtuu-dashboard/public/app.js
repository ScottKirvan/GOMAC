/**
 * Shared concentric-ring dial geometry: amp (outer) / SOC (middle) / solar
 * (inner), all centered on the same point. Radii/stroke-widths are chosen
 * for even breathing room between all three rings at the current viewBox
 * size -- see public/index.html's <svg viewBox="0 0 128 128"> for the
 * matching static markup (track circles, initial dasharray values).
 */
const DIAL_CENTER = 64;
const SOC_RING_RADIUS = 47;
const SOC_RING_CIRCUMFERENCE = 2 * Math.PI * SOC_RING_RADIUS;
const SOLAR_RING_RADIUS = 35;
const SOLAR_RING_CIRCUMFERENCE = 2 * Math.PI * SOLAR_RING_RADIUS;

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

function fmt(value, digits, unit) {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}${unit ?? ""}`;
}

function fmtSigned(value, digits, unit) {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}${unit ?? ""}`;
}

function formatAge(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

function formatDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = (m / 60).toFixed(1);
  return `${h}h`;
}

function formatClock(ms) {
  if (ms === undefined || Number.isNaN(ms)) return "--:--";
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function renderPowerGauge(power, history) {
  const soc = power.soc;
  const socPct = soc === undefined ? 0 : Math.min(100, Math.max(0, soc));
  const socDash = (socPct / 100) * SOC_RING_CIRCUMFERENCE;
  document.getElementById("socRing").setAttribute(
    "stroke-dasharray",
    `${socDash.toFixed(1)} ${(SOC_RING_CIRCUMFERENCE - socDash).toFixed(1)}`,
  );

  const solarSamples = history.map((h) => h.solarPower).filter((v) => v !== undefined);
  const hasSolarData = power.solarPower !== undefined || solarSamples.length > 0;
  // Math.max(1, ...) keeps the ratio below well-defined (no div-by-zero)
  // even when every reading so far has been 0 -- the floor is just for the
  // ring's fill percentage, so it's kept separate from hasSolarData, which
  // decides whether the Recent Peak stat row below has anything real to show.
  const recentPeak = Math.max(1, power.solarPower ?? 0, ...solarSamples);
  const solarPct = power.solarPower === undefined ? 0 : Math.min(1, power.solarPower / recentPeak);
  const solarDash = solarPct * SOLAR_RING_CIRCUMFERENCE;
  document.getElementById("solarRing").setAttribute(
    "stroke-dasharray",
    `${solarDash.toFixed(1)} ${(SOLAR_RING_CIRCUMFERENCE - solarDash).toFixed(1)}`,
  );

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

  document.getElementById("solarSub").textContent =
    power.solarPower === undefined ? "no solar" : `${Math.round(power.solarPower)}W`;

  document.getElementById("voltageVal").textContent = fmt(power.voltage, 2, " V");

  /**
   * "Recent peak" is NOT a fixed clock window -- it's the max solarPower
   * seen across whatever's currently in the in-memory sample ring buffer
   * (src/history.ts, capped at 500 samples, with a new sample appended on
   * essentially every victron-ble MQTT message once the battery device has
   * reported once). That buffer's real-world time span depends entirely on
   * how many Victron devices/metrics are actively publishing -- e.g. with
   * 4 devices reporting ~20 metrics/minute combined, 500 samples covers
   * roughly 25-30 minutes, not hours. So the window is computed and shown
   * here from the actual oldest sample timestamp rather than hardcoded,
   * since it drifts as devices are added/removed.
   */
  const recentPeakVal = document.getElementById("recentPeakVal");
  if (!hasSolarData) {
    recentPeakVal.textContent = "—";
    recentPeakVal.title = "";
  } else if (history.length > 0) {
    const windowMs = Date.now() - history[0].t;
    const windowLabel = formatDuration(windowMs);
    recentPeakVal.textContent = `${fmt(recentPeak, 0, " W")} (last ${windowLabel})`;
    recentPeakVal.title = `Highest solar reading across the last ${history.length} telemetry sample${history.length === 1 ? "" : "s"} held in memory, which currently spans about ${windowLabel} of wall-clock time. This is a sample-count window, not a fixed duration -- it stretches or shrinks with how many Victron metrics are actively reporting.`;
  } else {
    recentPeakVal.textContent = fmt(recentPeak, 0, " W");
    recentPeakVal.title = "";
  }

  document.getElementById("chargerVal").textContent = power.chargerState ?? "—";

  document.getElementById("powerSourceMac").textContent = power.batteryDeviceMac
    ? power.batteryDeviceMac
    : "no data yet";
}

/**
 * Point on a circle of radius `r` around (cx, cy), where angle 0 is
 * straight up (12 o'clock / top dead center) and positive angles sweep
 * clockwise -- i.e. a plain clock-face angle, not the math convention
 * (0 = 3 o'clock, CCW positive) SVG/trig normally uses.
 */
function polarPointFromTop(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

/**
 * SVG arc path starting at top dead center and sweeping `extentDeg`
 * clockwise (positive) or counter-clockwise (negative). Used for the
 * bidirectional amp gauge, where a <circle>+stroke-dasharray (as used by
 * the SOC/solar rings above) can't express "fill the other direction" --
 * dasharray always walks the circle's own fixed draw direction, so a real
 * arc path with an explicit sweep flag is required instead.
 *
 * `extentDeg` is clamped just short of a full turn (rather than exactly
 * 360) because an arc whose start and end point are identical collapses
 * to a zero-length, invisible path in SVG.
 */
function describeArcFromTop(cx, cy, r, extentDeg) {
  if (!extentDeg) return "";
  const clamped = Math.sign(extentDeg) * Math.min(Math.abs(extentDeg), 359.9);
  const start = polarPointFromTop(cx, cy, r, 0);
  const end = polarPointFromTop(cx, cy, r, clamped);
  const largeArcFlag = Math.abs(clamped) > 180 ? 1 : 0;
  const sweepFlag = clamped > 0 ? 1 : 0;
  return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
}

/**
 * Bidirectional amp gauge: 0A sits at top dead center with an empty bar.
 * Charge (positive current) fills clockwise in green; draw/discharge
 * (negative current) fills counter-clockwise in red. +-AMP_GAUGE_FULL_SCALE_A
 * is a full 360 degree fill. This is now the outermost of the three
 * concentric dial rings (amp / SOC / solar), sharing one center with
 * renderPowerGauge's rings -- see DIAL_CENTER / AMP_GAUGE_RADIUS above.
 * Values beyond full scale are capped visually at 100% (not wrapped) but a
 * small pulsing dot marks the pegged end of the bar so the overflow is
 * obvious -- the live numeric amp reading in the dial center is always the
 * real, uncapped value regardless of pegging.
 */
function renderAmpGauge(power) {
  const arc = document.getElementById("ampArc");
  const overflowDot = document.getElementById("ampOverflowDot");
  const reading = document.getElementById("ampReading");

  const current = power.current;
  reading.textContent = fmtSigned(current, 1, " A");
  reading.classList.remove("is-charge", "is-draw");

  if (current === undefined || Number.isNaN(current) || current === 0) {
    arc.setAttribute("d", "");
    arc.classList.remove("amp-arc-overflow");
    overflowDot.setAttribute("r", "0");
    reading.title = "";
    return;
  }

  const magnitude = Math.abs(current);
  const pct = Math.min(1, magnitude / AMP_GAUGE_FULL_SCALE_A);
  const overflowing = magnitude > AMP_GAUGE_FULL_SCALE_A;
  const extent = (current > 0 ? 1 : -1) * pct * 360;
  const color = current > 0 ? "var(--good)" : "var(--crit)";

  arc.setAttribute("d", describeArcFromTop(AMP_GAUGE_CENTER, AMP_GAUGE_CENTER, AMP_GAUGE_RADIUS, extent));
  arc.setAttribute("stroke", color);
  arc.classList.toggle("amp-arc-overflow", overflowing);

  if (overflowing) {
    const tip = polarPointFromTop(AMP_GAUGE_CENTER, AMP_GAUGE_CENTER, AMP_GAUGE_RADIUS, extent);
    overflowDot.setAttribute("cx", tip.x.toFixed(3));
    overflowDot.setAttribute("cy", tip.y.toFixed(3));
    overflowDot.setAttribute("fill", color);
    overflowDot.setAttribute("r", "3.5");
  } else {
    overflowDot.setAttribute("r", "0");
  }

  reading.classList.add(current > 0 ? "is-charge" : "is-draw");
  const label = current > 0 ? "charging" : "drawing";
  reading.title = overflowing
    ? `${label}, pegged — exceeds the ±${AMP_GAUGE_FULL_SCALE_A}A gauge scale`
    : label;
}

function buildChartSvg(history) {
  const pts = history.filter((s) => s.solarPower !== undefined || s.power !== undefined);
  if (pts.length < 2) return undefined;

  const allVals = [
    ...pts.map((p) => p.solarPower).filter((v) => v !== undefined),
    ...pts.map((p) => p.power).filter((v) => v !== undefined),
    0,
  ];
  let min = Math.min(...allVals);
  let max = Math.max(...allVals);
  if (min === max) {
    min -= 10;
    max += 10;
  }
  const pad = (max - min) * 0.1 || 10;
  min -= pad;
  max += pad;

  const t0 = pts[0].t;
  const t1 = pts[pts.length - 1].t;
  const xFor = (t) => (t1 === t0 ? 40 : 40 + ((t - t0) / (t1 - t0)) * 550);
  const yFor = (v) => 150 - ((v - min) / (max - min)) * 140;

  const solarPts = pts.filter((p) => p.solarPower !== undefined);
  const battPts = pts.filter((p) => p.power !== undefined);
  const solarLine = solarPts.map((p) => `${xFor(p.t).toFixed(1)},${yFor(p.solarPower).toFixed(1)}`).join(" ");
  const battLine = battPts.map((p) => `${xFor(p.t).toFixed(1)},${yFor(p.power).toFixed(1)}`).join(" ");

  const zeroInRange = min <= 0 && 0 <= max;
  const zeroY = yFor(0);

  const lastSolar = solarPts[solarPts.length - 1];
  const lastBatt = battPts[battPts.length - 1];

  const gridLines = [
    `<line class="chart-grid-line" x1="40" y1="10" x2="590" y2="10" /><text class="chart-axis-label" x="34" y="13" text-anchor="end">${Math.round(max)}W</text>`,
    `<line class="chart-grid-line" x1="40" y1="150" x2="590" y2="150" /><text class="chart-axis-label" x="34" y="153" text-anchor="end">${Math.round(min)}W</text>`,
  ];
  if (zeroInRange) {
    gridLines.push(
      `<line class="chart-baseline" x1="40" y1="${zeroY.toFixed(1)}" x2="590" y2="${zeroY.toFixed(1)}" /><text class="chart-axis-label" x="34" y="${(zeroY + 3.5).toFixed(1)}" text-anchor="end">0W</text>`,
    );
  }

  const solarGrad = solarLine
    ? `<polygon points="${solarLine} ${xFor(t1).toFixed(1)},150 40,150" fill="url(#solarChartGrad)" />`
    : "";

  return `
    <svg viewBox="0 0 600 180">
      <defs>
        <linearGradient id="solarChartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--solar)" stop-opacity="0.22" />
          <stop offset="100%" stop-color="var(--solar)" stop-opacity="0" />
        </linearGradient>
      </defs>
      ${gridLines.join("")}
      ${solarGrad}
      ${solarLine ? `<polyline points="${solarLine}" fill="none" stroke="var(--solar)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />` : ""}
      ${lastSolar ? `<circle cx="${xFor(lastSolar.t).toFixed(1)}" cy="${yFor(lastSolar.solarPower).toFixed(1)}" r="4" fill="var(--solar)" /><text class="chart-endlabel" x="${(xFor(lastSolar.t) + 6).toFixed(1)}" y="${(yFor(lastSolar.solarPower) - 2).toFixed(1)}" fill="var(--solar)">${Math.round(lastSolar.solarPower)}W</text>` : ""}
      ${battLine ? `<polyline points="${battLine}" fill="none" stroke="var(--battery)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />` : ""}
      ${lastBatt ? `<circle cx="${xFor(lastBatt.t).toFixed(1)}" cy="${yFor(lastBatt.power).toFixed(1)}" r="4" fill="var(--battery)" /><text class="chart-endlabel" x="${(xFor(lastBatt.t) + 6).toFixed(1)}" y="${(yFor(lastBatt.power) + 4).toFixed(1)}" fill="var(--battery)">${Math.round(lastBatt.power)}W</text>` : ""}
      <text class="chart-axis-label" x="40" y="170" text-anchor="start">${formatDuration(t1 - t0)} ago</text>
      <text class="chart-axis-label" x="558" y="170" text-anchor="end">now</text>
    </svg>
  `;
}

function renderChart(history) {
  const el = document.getElementById("powerChart");
  const svg = buildChartSvg(history);
  el.innerHTML = svg ?? `<div class="chart-empty">collecting data — check back once a few readings have come in</div>`;
  document.getElementById("historyMeta").textContent = `${history.length} sample${history.length === 1 ? "" : "s"}`;
}

function renderSensorTables(devices) {
  const container = document.getElementById("sensorTables");
  const macs = Object.keys(devices);
  if (macs.length === 0) {
    container.innerHTML = `<div class="panel"><div class="empty-state">no Victron devices seen yet — waiting for victron-ble-monitor.py's next publish cycle</div></div>`;
    return;
  }

  container.innerHTML = macs
    .map((mac) => {
      const device = devices[mac];
      const metrics = Object.entries(device.metrics).sort(([a], [b]) => a.localeCompare(b));
      const rows = metrics
        .map(
          ([metric, data]) =>
            `<tr><td class="metric">${metric}</td><td class="value">${data.value}</td><td class="age">${formatAge(data.updatedAt)}</td></tr>`,
        )
        .join("");
      return `
        <div class="panel">
          <div class="panel-head">
            <span class="panel-title">${mac}</span>
            <span class="panel-meta mono">${metrics.length} metrics</span>
          </div>
          <table class="sensors">
            <tr><th>Metric</th><th style="text-align:right">Value</th><th style="text-align:right">Updated</th></tr>
            ${rows}
          </table>
        </div>
      `;
    })
    .join("");
}

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

const COMPASS_POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function compassLabel(deg) {
  if (deg === undefined) return "—";
  const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return COMPASS_POINTS[idx];
}

function renderPosition(position) {
  const body = document.getElementById("positionBody");
  const hasFix = position.latitude !== undefined && position.longitude !== undefined;

  if (!hasFix) {
    body.innerHTML = `<div class="empty-state">no GPS fix yet</div>`;
    document.getElementById("positionMeta").textContent = "no fix yet";
    return;
  }

  const mph = position.speedMps !== undefined ? position.speedMps * 2.23694 : undefined;
  const heading = position.courseDeg;

  body.innerHTML = `
    <div class="pos-top">
      <svg class="pos-compass" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1.5" />
        <text x="32" y="10" text-anchor="middle" class="chart-axis-label">N</text>
        ${
          heading === undefined
            ? ""
            : `<line x1="32" y1="32" x2="32" y2="10" stroke="var(--position)" stroke-width="2.5" stroke-linecap="round" transform="rotate(${heading} 32 32)" />
               <circle cx="32" cy="32" r="3" fill="var(--position)" />`
        }
      </svg>
      <div class="pos-stats">
        <div class="pos-big"><span class="num">${mph === undefined ? "—" : Math.round(mph)}</span><span class="unit">mph</span></div>
        <div class="pos-sub">heading ${heading === undefined ? "—" : `${Math.round(heading)}° ${compassLabel(heading)}`}${mph !== undefined && mph > 1 ? " · moving" : ""}</div>
      </div>
    </div>
    <div class="pos-coords mono">${position.latitude.toFixed(4)}°, ${position.longitude.toFixed(4)}°${position.accuracyM !== undefined ? ` ±${Math.round(position.accuracyM)}m` : ""} · fix ${formatAge(position.updatedAt)}</div>
  `;
  document.getElementById("positionMeta").textContent = "phone GPS";
}

function buildRttSparkline(history) {
  const pts = history.filter((s) => s.avgRttMs !== undefined).slice(-20);
  if (pts.length < 2) return undefined;

  const max = Math.max(...pts.map((p) => p.avgRttMs), 10) * 1.15;
  const xStep = 200 / (pts.length - 1);
  const points = pts.map((p, i) => `${(i * xStep).toFixed(1)},${(46 - (p.avgRttMs / max) * 42).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const lastX = ((pts.length - 1) * xStep).toFixed(1);
  const lastY = (46 - (last.avgRttMs / max) * 42).toFixed(1);

  return `
    <svg viewBox="0 0 200 50" preserveAspectRatio="none">
      <polyline points="${points}" fill="none" stroke="var(--connectivity)" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round" />
      <circle cx="${lastX}" cy="${lastY}" r="2.75" fill="var(--connectivity)" />
    </svg>
  `;
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
      <span class="wx-temp">${Math.round(weather.temperatureC)}°C</span>
      <span class="wx-cond">${weather.condition ?? "—"}${weather.apparentTemperatureC !== undefined ? ` · feels ${Math.round(weather.apparentTemperatureC)}°` : ""}</span>
    </div>
    ${barSection}
  `;
}

function render(snapshot) {
  renderPowerGauge(snapshot.victron.power, snapshot.victron.history);
  renderAmpGauge(snapshot.victron.power);
  renderChart(snapshot.victron.history);
  renderSensorTables(snapshot.victron.devices);
  renderNowPlaying(snapshot.nowPlaying);
  renderPosition(snapshot.position);
  renderConnectivity(snapshot.connectivity);
  renderWeather(snapshot.weather);

  document.getElementById("serverTime").textContent = new Date(snapshot.serverTime).toLocaleTimeString();
  document.getElementById("footerNote").textContent = "polling /snapshot.json, weather via Open-Meteo";
}

const POLL_INTERVAL_MS = 10000;
const PROBE_TIMEOUT_MS = 3000;

function setConnState(state) {
  const el = document.getElementById("connState");
  el.className = "badge";
  if (state === "live") {
    el.textContent = "live";
    el.classList.add("ok");
  } else if (state === "connecting") {
    el.textContent = "connecting…";
  } else {
    el.textContent = "unreachable — retrying";
    el.classList.add("err");
  }
}

/**
 * Resolved once at startup, not per-poll: tries the tailnet-only base
 * first (real position included) with a short timeout, falls back to
 * the public base if that's unreachable -- which is the expected,
 * non-error outcome for any visitor not on the tailnet, not a fetch
 * failure to log or alarm on. When neither is configured (running
 * locally on TheFlea itself, or `npm run dev`), same-origin is already
 * correct and there's nothing to probe.
 */
async function resolveApiBase() {
  const privateBase = window.GOMAC_API_BASE_PRIVATE;
  const publicBase = window.GOMAC_API_BASE_PUBLIC;
  if (!privateBase && !publicBase) {
    return "";
  }

  if (privateBase) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(`${privateBase}/snapshot.json`, { cache: "no-store", signal: controller.signal });
      if (res.ok) {
        return privateBase;
      }
    } catch {
      // Not reachable -- most likely this visitor isn't on the tailnet.
      // Fall through to the public base below; this is the expected
      // path for the vast majority of visitors, not a failure.
    } finally {
      clearTimeout(timeout);
    }
  }

  return publicBase ?? "";
}

let apiBase = "";

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

async function start() {
  setConnState("connecting");
  apiBase = await resolveApiBase();
  poll();
  setInterval(poll, POLL_INTERVAL_MS);
}

start();

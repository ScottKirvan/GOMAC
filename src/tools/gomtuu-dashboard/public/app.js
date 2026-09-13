const SOC_RING_CIRCUMFERENCE = 2 * Math.PI * 47;
const SOLAR_RING_CIRCUMFERENCE = 2 * Math.PI * 34;

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
  const recentPeak = Math.max(1, power.solarPower ?? 0, ...solarSamples);
  const solarPct = power.solarPower === undefined ? 0 : Math.min(1, power.solarPower / recentPeak);
  const solarDash = solarPct * SOLAR_RING_CIRCUMFERENCE;
  document.getElementById("solarRing").setAttribute(
    "stroke-dasharray",
    `${solarDash.toFixed(1)} ${(SOLAR_RING_CIRCUMFERENCE - solarDash).toFixed(1)}`,
  );

  document.getElementById("socNum").textContent = soc === undefined ? "—" : `${Math.round(soc)}%`;
  document.getElementById("solarSub").textContent =
    power.solarPower === undefined ? "no solar" : `${Math.round(power.solarPower)}W`;

  document.getElementById("voltageVal").textContent = fmt(power.voltage, 2, " V");
  document.getElementById("currentVal").textContent = fmtSigned(power.current, 1, " A");
  document.getElementById("powerVal").textContent = fmtSigned(power.power, 0, " W");
  document.getElementById("solarVal").textContent = fmt(power.solarPower, 0, " W");
  document.getElementById("tempVal").textContent = fmt(power.temperature, 1, "°C");
  document.getElementById("chargerVal").textContent = power.chargerState ?? "—";

  document.getElementById("powerSourceMac").textContent = power.batteryDeviceMac
    ? power.batteryDeviceMac
    : "no data yet";
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

function render(snapshot) {
  renderPowerGauge(snapshot.victron.power, snapshot.victron.history);
  renderChart(snapshot.victron.history);
  renderSensorTables(snapshot.victron.devices);
  renderNowPlaying(snapshot.nowPlaying);
  renderPosition(snapshot.position);
  renderConnectivity(snapshot.connectivity);

  document.getElementById("weatherReason").textContent = snapshot.weather.reason;

  document.getElementById("serverTime").textContent = new Date(snapshot.serverTime).toLocaleTimeString();
  document.getElementById("footerNote").textContent =
    "live from Mosquitto over WebSocket — weather not wired yet";
}

function setConnState(state) {
  const el = document.getElementById("connState");
  el.className = "badge";
  if (state === "live") {
    el.textContent = "live";
    el.classList.add("ok");
  } else if (state === "connecting") {
    el.textContent = "connecting…";
  } else {
    el.textContent = "disconnected — retrying";
    el.classList.add("err");
  }
}

function connect() {
  setConnState("connecting");
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${location.host}/ws`);

  ws.addEventListener("open", () => setConnState("live"));
  ws.addEventListener("message", (event) => {
    try {
      render(JSON.parse(event.data));
    } catch (err) {
      console.error("failed to parse dashboard snapshot", err);
    }
  });
  ws.addEventListener("close", () => {
    setConnState("disconnected");
    setTimeout(connect, 3000);
  });
  ws.addEventListener("error", () => ws.close());
}

connect();

import type { ConnectivityState, ConnectivitySummary } from "./types.js";

/**
 * Confirmed live by the IT-side agent: `ping-monitor/<target>/<metric>`
 * for target in 8.8.8.8 / 1.1.1.1 / gateway, metric in rtt_ms / success,
 * retained, on ping-monitor's existing minutely timer -- CSV logging on
 * TheFlea left untouched, this is a second consumer of the same checks.
 * `success`'s exact payload encoding wasn't specified in that report, so
 * this parses leniently (numeric non-zero, or "true"/"1"/"up"/"ok"
 * case-insensitively) rather than assuming one exact string -- same
 * "don't guess with false confidence" posture as the Victron metric
 * names.
 */
const TOPIC_PREFIX = "ping-monitor";
const TRUE_STRINGS = new Set(["true", "1", "up", "ok"]);

export function createConnectivityState(): ConnectivityState {
  return { targets: {} };
}

export function parseConnectivityTopic(topic: string): { target: string; metric: string } | undefined {
  const parts = topic.split("/");
  if (parts.length !== 3 || parts[0] !== TOPIC_PREFIX) {
    return undefined;
  }
  const target = parts[1];
  const metric = parts[2];
  if (!target || !metric) {
    return undefined;
  }
  return { target, metric };
}

function parseSuccess(payload: string): boolean {
  const trimmed = payload.trim();
  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber)) {
    return asNumber !== 0;
  }
  return TRUE_STRINGS.has(trimmed.toLowerCase());
}

export function handleConnectivityMessage(
  state: ConnectivityState,
  topic: string,
  payload: string,
  now: number = Date.now(),
): void {
  const parsed = parseConnectivityTopic(topic);
  if (!parsed) {
    return;
  }
  const { target, metric } = parsed;
  const targetState = (state.targets[target] ??= {});

  if (metric === "rtt_ms") {
    const rtt = Number(payload);
    if (Number.isFinite(rtt)) {
      targetState.rttMs = rtt;
    }
  } else if (metric === "success") {
    targetState.success = parseSuccess(payload);
  } else {
    return;
  }

  targetState.updatedAt = now;
}

export function summarizeConnectivity(state: ConnectivityState): ConnectivitySummary {
  const targets = Object.values(state.targets);
  const known = targets.filter((t) => t.success !== undefined);
  if (known.length === 0) {
    return {};
  }

  const successCount = known.filter((t) => t.success).length;
  const successPct = (successCount / known.length) * 100;

  const rtts = known.filter((t) => t.success && t.rttMs !== undefined).map((t) => t.rttMs as number);
  const avgRttMs = rtts.length > 0 ? rtts.reduce((a, b) => a + b, 0) / rtts.length : undefined;

  return { successPct, avgRttMs };
}

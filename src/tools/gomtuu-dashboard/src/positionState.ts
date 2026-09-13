import type { PositionState } from "./types.js";

/**
 * Confirmed live by the IT-side agent handling the phone-GPS -> MQTT
 * bridge (rides HA's existing MQTT connection): `gps/phone/<metric>`,
 * retained, updated on every phone location report. Field list per that
 * report -- not independently re-verified against the live broker from
 * this repo, the same caveat as the Victron metric names.
 */
const TOPIC_PREFIX = "gps/phone";

export function createPositionState(): PositionState {
  return {};
}

export function parsePositionTopic(topic: string): string | undefined {
  if (!topic.startsWith(`${TOPIC_PREFIX}/`)) {
    return undefined;
  }
  return topic.slice(TOPIC_PREFIX.length + 1);
}

function toNumber(value: string): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function handlePositionMessage(
  state: PositionState,
  topic: string,
  payload: string,
  now: number = Date.now(),
): void {
  const metric = parsePositionTopic(topic);
  if (!metric) {
    return;
  }

  const num = toNumber(payload);
  switch (metric) {
    case "latitude":
      if (num !== undefined) state.latitude = num;
      break;
    case "longitude":
      if (num !== undefined) state.longitude = num;
      break;
    case "accuracy_m":
      if (num !== undefined) state.accuracyM = num;
      break;
    case "altitude_m":
      if (num !== undefined) state.altitudeM = num;
      break;
    case "speed_mps":
      if (num !== undefined) state.speedMps = num;
      break;
    case "course_deg":
      if (num !== undefined) state.courseDeg = num;
      break;
    default:
      return;
  }

  state.updatedAt = now;
}

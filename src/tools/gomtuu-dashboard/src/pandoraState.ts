import type { NowPlayingState } from "./types.js";

/**
 * Mirrors `src/integrations/pianobar/src/telemetry.ts`'s STATE_TOPIC_PREFIX
 * and metric names exactly -- that file is the verified source of truth
 * (checked directly against pianobar's own source, see its doc comment),
 * not a guess the way the Victron metric names are.
 */
const TOPIC_PREFIX = "gomac/pandora/state";

export function createNowPlayingState(): NowPlayingState {
  return {};
}

export function parsePandoraTopic(topic: string): string | undefined {
  if (!topic.startsWith(`${TOPIC_PREFIX}/`)) {
    return undefined;
  }
  return topic.slice(TOPIC_PREFIX.length + 1);
}

export function handlePandoraMessage(state: NowPlayingState, topic: string, payload: string, now: number = Date.now()): void {
  const metric = parsePandoraTopic(topic);
  if (!metric) {
    return;
  }

  switch (metric) {
    case "title":
      state.title = payload;
      break;
    case "artist":
      state.artist = payload;
      break;
    case "album":
      state.album = payload;
      break;
    case "station":
      state.station = payload;
      break;
    case "rating":
      state.rating = payload;
      break;
    case "cover_art":
      state.coverArt = payload;
      break;
    case "song_duration_ms": {
      const ms = Number(payload);
      if (Number.isFinite(ms)) {
        state.songDurationMs = ms;
      }
      break;
    }
    case "song_played_ms": {
      const ms = Number(payload);
      if (Number.isFinite(ms)) {
        state.songPlayedMs = ms;
      }
      break;
    }
    case "stations":
      try {
        const parsed: unknown = JSON.parse(payload);
        if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string")) {
          state.stations = parsed;
        }
      } catch {
        // malformed payload -- ignore, keep last-known stations list
      }
      break;
    default:
      return;
  }

  state.updatedAt = now;
}

/**
 * Field names and event semantics below are verified directly against
 * pianobar 2024.12.21's own source (the exact version installed on
 * TheFlea) -- src/ui.c's `BarUiStartEventCmd`/`BarUiEventcmdPrintSong` and
 * src/libpiano/{piano.h,response.c} -- not just `man pianobar`. Two things
 * this settles that pandora-mqtt-spec.md flagged as unverified:
 *
 * - `coverArt` is `PianoJsonStrdup(s, "albumArtUrl")`: a URL string
 *   straight from Pandora's API JSON, never raw image data.
 * - `rating` is printed as `%i`, one of libpiano's PianoSongRating_t
 *   values (0 none, 1 love, 2 ban, 3 tired) -- not a word.
 *
 * `songDuration`/`songPlayed` are milliseconds, confirmed by pianobar's own
 * contrib/eventcmd-examples/eventcmd.sh dividing songDuration by 1000
 * before handing it to a scrobbler expecting seconds.
 */

export const TELEMETRY_EVENTS = [
  "songstart",
  "songfinish",
  "songlove",
  "songban",
  "songshelf",
  "usergetstations",
  "stationfetchplaylist",
] as const;

export type TelemetryEventName = (typeof TELEMETRY_EVENTS)[number];

export function isTelemetryEvent(event: string): event is TelemetryEventName {
  return (TELEMETRY_EVENTS as readonly string[]).includes(event);
}

export function parseEventCommandStdin(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    if (line.length === 0) {
      continue;
    }
    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }
    result[line.slice(0, eqIndex)] = line.slice(eqIndex + 1);
  }
  return result;
}

/**
 * Every eventcmd invocation that carries a station list sorts it via
 * pianobar's own `BarSortedStations(stations, ..., settings.sortOrder)` --
 * the exact same call, with the exact same sort order, that the
 * interactive `s` prompt (`BarUiSelectStation`) uses to build the numbered
 * list a user picks from. Verified directly in pianobar 2024.12.21 source
 * (src/ui.c lines ~479-480 and ~981-982 both call `BarSortedStations` with
 * `app->settings.sortOrder`). This is what makes it safe for
 * `select_source` to send a bare index after `s`: `station<N>` from this
 * event's data is guaranteed to be the same station `s` would show at
 * prompt position `<N>`, *provided the station set hasn't changed*
 * (added/removed/renamed via another client) between this event firing and
 * the `s` keystroke being sent -- pianobar only resorts on its own
 * `usergetstations`/eventcmd calls, not continuously.
 */
export function parseStationList(data: Record<string, string>): string[] | undefined {
  const countRaw = data.stationCount;
  if (countRaw === undefined) {
    return undefined;
  }
  const count = Number(countRaw);
  if (!Number.isInteger(count) || count < 0) {
    return undefined;
  }
  const stations: string[] = [];
  for (let i = 0; i < count; i++) {
    const name = data[`station${i}`];
    if (name === undefined) {
      return undefined;
    }
    stations.push(name);
  }
  return stations;
}

const RATING_LABELS: Record<string, string> = {
  "0": "none",
  "1": "love",
  "2": "ban",
  "3": "tired",
};

export interface StateMessage {
  topic: string;
  payload: string;
}

export const STATE_TOPIC_PREFIX = "gomac/pandora/state";

type SimpleMetric = "title" | "artist" | "album" | "station" | "cover_art" | "song_duration_ms" | "song_played_ms";

const FIELD_FOR_METRIC: Record<SimpleMetric, string> = {
  title: "title",
  artist: "artist",
  album: "album",
  station: "stationName",
  cover_art: "coverArt",
  song_duration_ms: "songDuration",
  song_played_ms: "songPlayed",
};

type Metric = SimpleMetric | "rating" | "stations";

/**
 * Which metrics each event can plausibly carry, per pandora-mqtt-spec.md's
 * Telemetry Surface table. `stations` is included for every event, not
 * just `usergetstations`: pianobar attaches the full current station list
 * to every `BarUiStartEventCmd` call (see `parseStationList`'s doc
 * comment), so refreshing the cached list on every event -- not only
 * explicit re-fetches -- minimizes the staleness window `select_source`
 * has to worry about.
 */
const EVENT_METRICS: Record<TelemetryEventName, Metric[]> = {
  songstart: ["title", "artist", "album", "station", "rating", "cover_art", "song_duration_ms", "stations"],
  songfinish: [
    "title",
    "artist",
    "album",
    "station",
    "rating",
    "cover_art",
    "song_duration_ms",
    "song_played_ms",
    "stations",
  ],
  songlove: ["title", "artist", "album", "station", "rating", "cover_art", "stations"],
  songban: ["title", "artist", "album", "station", "rating", "cover_art", "stations"],
  songshelf: ["title", "artist", "album", "station", "rating", "cover_art", "stations"],
  usergetstations: ["stations"],
  stationfetchplaylist: ["title", "artist", "album", "station", "rating", "cover_art", "song_duration_ms", "stations"],
};

export function buildStateMessages(event: TelemetryEventName, data: Record<string, string>): StateMessage[] {
  const messages: StateMessage[] = [];

  for (const metric of EVENT_METRICS[event]) {
    if (metric === "stations") {
      const stations = parseStationList(data);
      if (stations !== undefined) {
        messages.push({ topic: `${STATE_TOPIC_PREFIX}/stations`, payload: JSON.stringify(stations) });
      }
      continue;
    }

    if (metric === "rating") {
      const label = data.rating !== undefined ? RATING_LABELS[data.rating] : undefined;
      if (label !== undefined) {
        messages.push({ topic: `${STATE_TOPIC_PREFIX}/rating`, payload: label });
      }
      continue;
    }

    const value = data[FIELD_FOR_METRIC[metric]];
    if (value !== undefined && value.length > 0) {
      messages.push({ topic: `${STATE_TOPIC_PREFIX}/${metric}`, payload: value });
    }
  }

  return messages;
}

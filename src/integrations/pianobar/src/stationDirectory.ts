export interface StationDirectory {
  getStations(): string[] | undefined;
  setStations(stations: string[]): void;
  /**
   * Fires only when the incoming list actually differs from the
   * previously known one -- pianobar attaches a station list to every
   * telemetry event, not just usergetstations (see telemetry.ts's
   * EVENT_METRICS doc comment), so without this dedupe a listener would
   * fire on nearly every song. Used by haDiscovery.ts to republish the
   * station `select` entity's discovery config only when its `options`
   * would genuinely change.
   */
  onStationsChanged(listener: (stations: string[]) => void): void;
}

function stationsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** In-memory only -- the most recently known station list resets on daemon restart, same as before any `usergetstations`/eventcmd has fired. */
export function createStationDirectory(): StationDirectory {
  let stations: string[] | undefined;
  const listeners: Array<(stations: string[]) => void> = [];
  return {
    getStations: () => stations,
    setStations: (next) => {
      const changed = stations === undefined || !stationsEqual(stations, next);
      stations = next;
      if (changed) {
        for (const listener of listeners) {
          listener(next);
        }
      }
    },
    onStationsChanged: (listener) => {
      listeners.push(listener);
    },
  };
}

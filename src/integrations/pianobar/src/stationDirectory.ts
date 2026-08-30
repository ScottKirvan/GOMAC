export interface StationDirectory {
  getStations(): string[] | undefined;
  setStations(stations: string[]): void;
}

/** In-memory only -- the most recently known station list resets on daemon restart, same as before any `usergetstations`/eventcmd has fired. */
export function createStationDirectory(): StationDirectory {
  let stations: string[] | undefined;
  return {
    getStations: () => stations,
    setStations: (next) => {
      stations = next;
    },
  };
}

import { describe, expect, it, vi } from "vitest";
import { createStationDirectory } from "../src/stationDirectory.js";

describe("createStationDirectory", () => {
  it("starts with no known stations", () => {
    expect(createStationDirectory().getStations()).toBeUndefined();
  });

  it("returns the most recently set station list", () => {
    const directory = createStationDirectory();
    directory.setStations(["Alpha", "Bravo"]);
    expect(directory.getStations()).toEqual(["Alpha", "Bravo"]);

    directory.setStations(["Charlie"]);
    expect(directory.getStations()).toEqual(["Charlie"]);
  });

  describe("onStationsChanged", () => {
    it("fires with the new list the first time stations are ever set", () => {
      const directory = createStationDirectory();
      const listener = vi.fn();
      directory.onStationsChanged(listener);

      directory.setStations(["Alpha", "Bravo"]);

      expect(listener).toHaveBeenCalledWith(["Alpha", "Bravo"]);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("fires again when the list genuinely changes", () => {
      const directory = createStationDirectory();
      directory.setStations(["Alpha"]);
      const listener = vi.fn();
      directory.onStationsChanged(listener);

      directory.setStations(["Alpha", "Bravo"]);

      expect(listener).toHaveBeenCalledWith(["Alpha", "Bravo"]);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("does not fire when pianobar resends the same station list", () => {
      const directory = createStationDirectory();
      directory.setStations(["Alpha", "Bravo"]);
      const listener = vi.fn();
      directory.onStationsChanged(listener);

      directory.setStations(["Alpha", "Bravo"]);

      expect(listener).not.toHaveBeenCalled();
    });

    it("fires when the same names come back in a different order (order is significant for select_source's index)", () => {
      const directory = createStationDirectory();
      directory.setStations(["Alpha", "Bravo"]);
      const listener = vi.fn();
      directory.onStationsChanged(listener);

      directory.setStations(["Bravo", "Alpha"]);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("notifies every registered listener", () => {
      const directory = createStationDirectory();
      const first = vi.fn();
      const second = vi.fn();
      directory.onStationsChanged(first);
      directory.onStationsChanged(second);

      directory.setStations(["Alpha"]);

      expect(first).toHaveBeenCalledWith(["Alpha"]);
      expect(second).toHaveBeenCalledWith(["Alpha"]);
    });
  });
});

import { describe, expect, it } from "vitest";
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
});

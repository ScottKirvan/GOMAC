import { describe, expect, it } from "vitest";
import { createNowPlayingState, handlePandoraMessage, parsePandoraTopic } from "../src/pandoraState.js";

describe("parsePandoraTopic", () => {
  it("extracts the metric from a well-formed state topic", () => {
    expect(parsePandoraTopic("gomac/pandora/state/title")).toBe("title");
  });

  it("returns undefined for topics outside the pandora state prefix", () => {
    expect(parsePandoraTopic("victron-ble/AA:BB/soc")).toBeUndefined();
  });
});

describe("handlePandoraMessage", () => {
  it("applies simple string fields", () => {
    const state = createNowPlayingState();
    handlePandoraMessage(state, "gomac/pandora/state/title", "Come Together");
    handlePandoraMessage(state, "gomac/pandora/state/artist", "The Beatles");
    handlePandoraMessage(state, "gomac/pandora/state/station", "Tool Radio");
    handlePandoraMessage(state, "gomac/pandora/state/rating", "love");

    expect(state.title).toBe("Come Together");
    expect(state.artist).toBe("The Beatles");
    expect(state.station).toBe("Tool Radio");
    expect(state.rating).toBe("love");
    expect(state.updatedAt).toBeDefined();
  });

  it("parses millisecond fields as numbers", () => {
    const state = createNowPlayingState();
    handlePandoraMessage(state, "gomac/pandora/state/song_duration_ms", "260000");
    handlePandoraMessage(state, "gomac/pandora/state/song_played_ms", "107000");

    expect(state.songDurationMs).toBe(260000);
    expect(state.songPlayedMs).toBe(107000);
  });

  it("ignores non-numeric millisecond payloads rather than storing NaN", () => {
    const state = createNowPlayingState();
    handlePandoraMessage(state, "gomac/pandora/state/song_duration_ms", "not-a-number");
    expect(state.songDurationMs).toBeUndefined();
  });

  it("parses the stations list from JSON", () => {
    const state = createNowPlayingState();
    handlePandoraMessage(state, "gomac/pandora/state/stations", JSON.stringify(["Tool Radio", "Jazz"]));
    expect(state.stations).toEqual(["Tool Radio", "Jazz"]);
  });

  it("keeps the last-known stations list on malformed JSON", () => {
    const state = createNowPlayingState();
    handlePandoraMessage(state, "gomac/pandora/state/stations", JSON.stringify(["Tool Radio"]));
    handlePandoraMessage(state, "gomac/pandora/state/stations", "{not json");
    expect(state.stations).toEqual(["Tool Radio"]);
  });

  it("ignores topics outside the pandora prefix", () => {
    const state = createNowPlayingState();
    handlePandoraMessage(state, "victron-ble/AA:BB/soc", "82");
    expect(state).toEqual({});
  });
});

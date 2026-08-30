import { describe, expect, it } from "vitest";
import {
  buildStateMessages,
  isTelemetryEvent,
  parseEventCommandStdin,
  parseStationList,
} from "../src/telemetry.js";

describe("parseEventCommandStdin", () => {
  it("parses key=value lines into a record", () => {
    const raw = "title=Foo\nartist=Bar\nalbum=Baz\n";
    expect(parseEventCommandStdin(raw)).toEqual({ title: "Foo", artist: "Bar", album: "Baz" });
  });

  it("splits only on the first '=', preserving '=' inside a value", () => {
    expect(parseEventCommandStdin("coverArt=https://example.com/x?a=b\n")).toEqual({
      coverArt: "https://example.com/x?a=b",
    });
  });

  it("ignores blank lines and lines without '='", () => {
    expect(parseEventCommandStdin("title=Foo\n\nnotakeyvalue\nartist=Bar")).toEqual({
      title: "Foo",
      artist: "Bar",
    });
  });

  it("preserves empty values (pianobar sends stationName= when there is no current station)", () => {
    expect(parseEventCommandStdin("stationName=\nstationCount=0\n")).toEqual({
      stationName: "",
      stationCount: "0",
    });
  });

  it("returns an empty record for empty input", () => {
    expect(parseEventCommandStdin("")).toEqual({});
  });
});

describe("isTelemetryEvent", () => {
  it("accepts every event listed in pandora-mqtt-spec.md's Telemetry Surface table", () => {
    for (const event of [
      "songstart",
      "songfinish",
      "songlove",
      "songban",
      "songshelf",
      "usergetstations",
      "stationfetchplaylist",
    ]) {
      expect(isTelemetryEvent(event)).toBe(true);
    }
  });

  it("rejects events outside this phase's scope", () => {
    for (const event of ["stationdelete", "stationrename", "songbookmark", "settingschange"]) {
      expect(isTelemetryEvent(event)).toBe(false);
    }
  });
});

describe("parseStationList", () => {
  it("parses stationCount + station0..N into an ordered array", () => {
    const data = { stationCount: "3", station0: "Alpha", station1: "Bravo", station2: "Charlie" };
    expect(parseStationList(data)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("returns an empty array for stationCount=0", () => {
    expect(parseStationList({ stationCount: "0" })).toEqual([]);
  });

  it("returns undefined when stationCount is missing", () => {
    expect(parseStationList({ title: "Foo" })).toBeUndefined();
  });

  it("returns undefined when a station index is missing, rather than a sparse/short array", () => {
    expect(parseStationList({ stationCount: "3", station0: "Alpha", station2: "Charlie" })).toBeUndefined();
  });
});

describe("buildStateMessages", () => {
  it("publishes now-playing fields for songstart, including the station list", () => {
    const data = {
      stationName: "My Station",
      songStationName: "",
      pRet: "1",
      pRetStr: "ok",
      wRet: "0",
      wRetStr: "ok",
      songPlayed: "0",
      artist: "The Artist",
      title: "The Title",
      album: "The Album",
      coverArt: "https://example.com/art.jpg",
      rating: "1",
      detailUrl: "https://example.com/song",
      songDuration: "245000",
      stationCount: "2",
      station0: "Alpha",
      station1: "Bravo",
    };

    const messages = buildStateMessages("songstart", data);
    const byTopic = Object.fromEntries(messages.map((m) => [m.topic, m.payload]));

    expect(byTopic["gomac/pandora/state/title"]).toBe("The Title");
    expect(byTopic["gomac/pandora/state/artist"]).toBe("The Artist");
    expect(byTopic["gomac/pandora/state/album"]).toBe("The Album");
    expect(byTopic["gomac/pandora/state/station"]).toBe("My Station");
    expect(byTopic["gomac/pandora/state/rating"]).toBe("love");
    expect(byTopic["gomac/pandora/state/cover_art"]).toBe("https://example.com/art.jpg");
    expect(byTopic["gomac/pandora/state/song_duration_ms"]).toBe("245000");
    expect(byTopic["gomac/pandora/state/stations"]).toBe(JSON.stringify(["Alpha", "Bravo"]));
    expect(byTopic["gomac/pandora/state/song_played_ms"]).toBeUndefined();
  });

  it("publishes play-completion telemetry for songfinish", () => {
    const data = {
      stationName: "My Station",
      songPlayed: "180000",
      songDuration: "245000",
      title: "The Title",
      artist: "The Artist",
      album: "The Album",
      coverArt: "https://example.com/art.jpg",
      rating: "0",
      stationCount: "0",
    };

    const messages = buildStateMessages("songfinish", data);
    const byTopic = Object.fromEntries(messages.map((m) => [m.topic, m.payload]));

    expect(byTopic["gomac/pandora/state/song_played_ms"]).toBe("180000");
    expect(byTopic["gomac/pandora/state/song_duration_ms"]).toBe("245000");
    expect(byTopic["gomac/pandora/state/rating"]).toBe("none");
  });

  it("maps every PianoSongRating_t value to its label", () => {
    const base = { stationCount: "0" };
    expect(
      buildStateMessages("songlove", { ...base, rating: "0" }).find((m) => m.topic.endsWith("/rating"))?.payload,
    ).toBe("none");
    expect(
      buildStateMessages("songlove", { ...base, rating: "1" }).find((m) => m.topic.endsWith("/rating"))?.payload,
    ).toBe("love");
    expect(
      buildStateMessages("songban", { ...base, rating: "2" }).find((m) => m.topic.endsWith("/rating"))?.payload,
    ).toBe("ban");
    expect(
      buildStateMessages("songshelf", { ...base, rating: "3" }).find((m) => m.topic.endsWith("/rating"))?.payload,
    ).toBe("tired");
  });

  it("publishes only the station list for usergetstations, never blank song fields", () => {
    const data = {
      stationName: "",
      songStationName: "",
      songPlayed: "0",
      stationCount: "2",
      station0: "Alpha",
      station1: "Bravo",
    };

    const messages = buildStateMessages("usergetstations", data);

    expect(messages).toEqual([{ topic: "gomac/pandora/state/stations", payload: JSON.stringify(["Alpha", "Bravo"]) }]);
  });

  it("publishes the new station's now-playing fields and refreshed list for stationfetchplaylist", () => {
    const data = {
      stationName: "New Station",
      songPlayed: "0",
      title: "First Song",
      artist: "Someone",
      album: "Some Album",
      coverArt: "https://example.com/new.jpg",
      rating: "0",
      songDuration: "200000",
      stationCount: "1",
      station0: "New Station",
    };

    const messages = buildStateMessages("stationfetchplaylist", data);
    const byTopic = Object.fromEntries(messages.map((m) => [m.topic, m.payload]));

    expect(byTopic["gomac/pandora/state/station"]).toBe("New Station");
    expect(byTopic["gomac/pandora/state/title"]).toBe("First Song");
    expect(byTopic["gomac/pandora/state/stations"]).toBe(JSON.stringify(["New Station"]));
  });

  it("omits fields that are absent entirely (curSong == NULL in pianobar)", () => {
    const data = { stationName: "Some Station", songPlayed: "0", stationCount: "0" };
    const messages = buildStateMessages("songfinish", data);
    const topics = messages.map((m) => m.topic);
    expect(topics).not.toContain("gomac/pandora/state/title");
    expect(topics).not.toContain("gomac/pandora/state/rating");
    expect(topics).not.toContain("gomac/pandora/state/cover_art");
  });
});

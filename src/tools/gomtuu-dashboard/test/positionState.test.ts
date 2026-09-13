import { describe, expect, it } from "vitest";
import { createPositionState, handlePositionMessage, parsePositionTopic } from "../src/positionState.js";

describe("parsePositionTopic", () => {
  it("extracts the metric from a well-formed gps/phone topic", () => {
    expect(parsePositionTopic("gps/phone/latitude")).toBe("latitude");
  });

  it("returns undefined for topics outside gps/phone", () => {
    expect(parsePositionTopic("victron-ble/AA:BB/soc")).toBeUndefined();
  });
});

describe("handlePositionMessage", () => {
  it("applies every known numeric field", () => {
    const state = createPositionState();
    handlePositionMessage(state, "gps/phone/latitude", "45.5017");
    handlePositionMessage(state, "gps/phone/longitude", "-73.5673");
    handlePositionMessage(state, "gps/phone/accuracy_m", "8");
    handlePositionMessage(state, "gps/phone/altitude_m", "42.1");
    handlePositionMessage(state, "gps/phone/speed_mps", "18.3");
    handlePositionMessage(state, "gps/phone/course_deg", "214");

    expect(state).toEqual({
      latitude: 45.5017,
      longitude: -73.5673,
      accuracyM: 8,
      altitudeM: 42.1,
      speedMps: 18.3,
      courseDeg: 214,
      updatedAt: expect.any(Number),
    });
  });

  it("ignores non-numeric payloads rather than storing NaN", () => {
    const state = createPositionState();
    handlePositionMessage(state, "gps/phone/latitude", "not-a-number");
    expect(state.latitude).toBeUndefined();
  });

  it("ignores unrecognized metrics and topics outside the prefix", () => {
    const state = createPositionState();
    handlePositionMessage(state, "gps/phone/unknown_field", "1");
    handlePositionMessage(state, "victron-ble/AA:BB/soc", "82");
    expect(state).toEqual({});
  });
});

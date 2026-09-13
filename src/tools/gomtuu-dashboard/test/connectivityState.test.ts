import { describe, expect, it } from "vitest";
import {
  createConnectivityState,
  handleConnectivityMessage,
  parseConnectivityTopic,
  summarizeConnectivity,
} from "../src/connectivityState.js";

describe("parseConnectivityTopic", () => {
  it("parses a well-formed ping-monitor topic", () => {
    expect(parseConnectivityTopic("ping-monitor/8.8.8.8/rtt_ms")).toEqual({
      target: "8.8.8.8",
      metric: "rtt_ms",
    });
  });

  it("returns undefined outside the ping-monitor prefix or wrong shape", () => {
    expect(parseConnectivityTopic("victron-ble/AA:BB/soc")).toBeUndefined();
    expect(parseConnectivityTopic("ping-monitor/8.8.8.8")).toBeUndefined();
  });
});

describe("handleConnectivityMessage + summarizeConnectivity", () => {
  it("computes success percentage and average RTT across successful targets", () => {
    const state = createConnectivityState();
    handleConnectivityMessage(state, "ping-monitor/8.8.8.8/rtt_ms", "32");
    handleConnectivityMessage(state, "ping-monitor/8.8.8.8/success", "true");
    handleConnectivityMessage(state, "ping-monitor/1.1.1.1/rtt_ms", "28");
    handleConnectivityMessage(state, "ping-monitor/1.1.1.1/success", "1");
    handleConnectivityMessage(state, "ping-monitor/gateway/rtt_ms", "4");
    handleConnectivityMessage(state, "ping-monitor/gateway/success", "false");

    const summary = summarizeConnectivity(state);
    expect(summary.successPct).toBeCloseTo((2 / 3) * 100);
    expect(summary.avgRttMs).toBeCloseTo((32 + 28) / 2);
  });

  it("parses success leniently across numeric and string encodings", () => {
    const state = createConnectivityState();
    handleConnectivityMessage(state, "ping-monitor/8.8.8.8/success", "0");
    expect(state.targets["8.8.8.8"]?.success).toBe(false);

    handleConnectivityMessage(state, "ping-monitor/1.1.1.1/success", "UP");
    expect(state.targets["1.1.1.1"]?.success).toBe(true);
  });

  it("returns an empty summary when nothing is known yet", () => {
    expect(summarizeConnectivity(createConnectivityState())).toEqual({});
  });

  it("ignores malformed topics", () => {
    const state = createConnectivityState();
    handleConnectivityMessage(state, "not-ping-monitor/8.8.8.8/success", "true");
    expect(state.targets).toEqual({});
  });
});

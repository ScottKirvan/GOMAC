import { describe, expect, it } from "vitest";
import { computeEnergyFlows, createGhostHold } from "../src/energyFlows.js";
import { createVictronStore, handleVictronMessage, type VictronStore } from "../src/victronState.js";

const SOLAR = "dd1cc7607ae4";
const ORION = "cfa81f1481e1";
const SHORE = "f0ead52388a9";
const SHUNT = "e0b42569296f";

function publish(store: VictronStore, mac: string, metrics: Record<string, string>): void {
  for (const [metric, value] of Object.entries(metrics)) handleVictronMessage(store, `victron-ble/${mac}/${metric}`, value);
}

/** Solar delivering 10 A at 13 V (130 W), the load output at 1 A (13 W), the battery charging at 2 A (26 W). */
function van(orionState: string): VictronStore {
  const store = createVictronStore();
  publish(store, SOLAR, { availability: "online", battery_charging_current: "10", battery_voltage: "13", external_device_load: "1", solar_power: "140" });
  publish(store, ORION, { availability: "online", charge_state: orionState, input_voltage: "14.2", off_reason: "NONE" });
  publish(store, SHORE, { availability: "offline", output_current1: "5", output_voltage1: "13.5" });
  publish(store, SHUNT, { availability: "online", soc: "90", voltage: "13", current: "2" });
  return store;
}

describe("computeEnergyFlows", () => {
  it("works out the ghost load from the battery balance while the Orion is off", () => {
    const flows = computeEnergyFlows(van("OFF"), { powerW: 25 }, createGhostHold(), 1000);
    expect(flows.solarW).toBeCloseTo(130);
    expect(flows.loadW).toBeCloseTo(13);
    expect(flows.shoreW).toBe(0);
    expect(flows.alternatorW).toBe(0);
    expect(flows.starlinkW).toBe(25);
    // In: 130 W. Out: 26 W into the battery + 25 W Starlink + 13 W load, leaving 66 W unaccounted for.
    expect(flows.ghostW).toBeCloseTo(66);
    expect(flows.ghostEstimated).toBe(false);
    expect(flows.chargeW).toBeCloseTo(130);
    expect(flows.drawW).toBeCloseTo(104);
  });

  it("holds the last ghost load while the Orion charges, and gives the alternator the rest", () => {
    const hold = createGhostHold();
    computeEnergyFlows(van("OFF"), { powerW: 25 }, hold, 1000);

    const store = van("BULK");
    publish(store, SHUNT, { current: "20" }); // 260 W into the battery now
    const flows = computeEnergyFlows(store, { powerW: 25 }, hold, 60_000);
    expect(flows.ghostW).toBeCloseTo(66);
    expect(flows.ghostEstimated).toBe(true);
    // Out: 260 + 25 + 13 + 66 = 364 W. Solar covers 130 W, so the alternator supplies 234 W.
    expect(flows.alternatorW).toBeCloseTo(234);
    expect(flows.chargeW).toBeCloseTo(364);
  });

  it("takes the ghost load as zero when the held value is over an hour old", () => {
    const hold = createGhostHold();
    computeEnergyFlows(van("OFF"), { powerW: 25 }, hold, 0);
    const flows = computeEnergyFlows(van("BULK"), { powerW: 25 }, hold, 61 * 60_000);
    expect(flows.ghostW).toBe(0);
    expect(flows.ghostEstimated).toBe(true);
    expect(flows.alternatorW).toBe(0); // 26 + 25 + 13 - 130 is negative: nothing left for the alternator
  });

  it("counts the shore charger only while it's online", () => {
    const store = van("OFF");
    publish(store, SHORE, { availability: "online" });
    expect(computeEnergyFlows(store, {}, createGhostHold(), 1000).shoreW).toBeCloseTo(67.5);
  });

  it("treats an offline Orion as not charging", () => {
    const store = van("BULK");
    publish(store, ORION, { availability: "offline" });
    const flows = computeEnergyFlows(store, {}, createGhostHold(), 1000);
    expect(flows.alternatorW).toBe(0);
    expect(flows.ghostEstimated).toBe(false);
  });

  it("never reports a negative ghost load", () => {
    const store = van("OFF");
    publish(store, SHUNT, { current: "15" }); // more into the battery than solar can explain
    expect(computeEnergyFlows(store, {}, createGhostHold(), 1000).ghostW).toBe(0);
  });

  it("leaves the inferred flows out without a battery reading", () => {
    const store = van("OFF");
    delete store.devices[SHUNT];
    const flows = computeEnergyFlows(store, { powerW: 25 }, createGhostHold(), 1000);
    expect(flows.ghostW).toBeUndefined();
    expect(flows.alternatorW).toBeUndefined();
    expect(flows.solarW).toBeCloseTo(130);
    expect(flows.drawW).toBeUndefined();
  });

  it("reports solar, its load output, and everything inferred as unknown while the MPPT is offline", () => {
    const hold = createGhostHold();
    computeEnergyFlows(van("OFF"), { powerW: 25 }, hold, 1000);
    const store = van("OFF");
    publish(store, SOLAR, { availability: "offline" });
    const flows = computeEnergyFlows(store, { powerW: 25 }, hold, 2000);
    expect(flows.solarW).toBeUndefined();
    expect(flows.loadW).toBeUndefined();
    expect(flows.ghostW).toBeUndefined();
    expect(flows.alternatorW).toBeUndefined();
    expect(flows.chargeW).toBeUndefined();
    expect(flows.drawW).toBeUndefined();
    expect(flows.starlinkW).toBe(25);
    expect(hold).toEqual({ w: expect.closeTo(66), at: 1000 });
  });

  it("passes the Starlink peak through", () => {
    expect(computeEnergyFlows(van("OFF"), { powerW: 25, peakW: 41 }, createGhostHold(), 1000).starlinkPeakW).toBe(41);
  });
});

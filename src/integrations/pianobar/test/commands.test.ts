import { describe, expect, it } from "vitest";
import { isTier1Action, TIER1_KEYSTROKES } from "../src/commands.js";

describe("Tier 1 command surface", () => {
  it("maps every Tier 1 action from the spec to its documented keystroke", () => {
    expect(TIER1_KEYSTROKES).toEqual({
      love: "+",
      ban: "-",
      next: "n",
      pause: "S",
      resume: "P",
      play: "P",
      toggle: "p",
      tired: "t",
      volume_down: "(",
      volume_up: ")",
      volume_reset: "^",
    });
  });

  it("recognizes every known action as Tier 1", () => {
    for (const action of Object.keys(TIER1_KEYSTROKES)) {
      expect(isTier1Action(action)).toBe(true);
    }
  });

  it("rejects unknown or Tier 2/3 actions", () => {
    expect(isTier1Action("select_source")).toBe(false);
    expect(isTier1Action("bookmark")).toBe(false);
    expect(isTier1Action("restart")).toBe(false);
    expect(isTier1Action("")).toBe(false);
  });
});

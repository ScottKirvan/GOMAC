/**
 * Tier 1 command surface from pandora-mqtt-spec.md's Command Surface table:
 * every action drivable as a single FIFO keystroke with no follow-up input.
 * "resume" and "play" are aliases for the same keystroke, as are "toggle"
 * and pianobar's own "pause-resume-toggle" naming.
 */
export type Tier1Action =
  | "love"
  | "ban"
  | "next"
  | "pause"
  | "resume"
  | "play"
  | "toggle"
  | "tired"
  | "volume_down"
  | "volume_up"
  | "volume_reset";

export const TIER1_KEYSTROKES: Record<Tier1Action, string> = {
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
};

export function isTier1Action(action: string): action is Tier1Action {
  return Object.prototype.hasOwnProperty.call(TIER1_KEYSTROKES, action);
}

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const WPCTL_TIMEOUT_MS = 5000;
const DEFAULT_SINK = "@DEFAULT_AUDIO_SINK@";

export interface SystemVolumeOps {
  getVolume(): Promise<number | undefined>;
  setVolume(level: number): Promise<void>;
}

/**
 * `wpctl set-volume` applies its value as raw linear amplitude -- confirmed
 * against `wpctl --help`, no curve/scaling option exists. Found live on
 * this JBL GO 2 Bluetooth sink: setting 0.0 mutes correctly, but every
 * other value in the 0.0-1.0 range sounds indistinguishable -- the classic
 * signature of a device whose perceived loudness responds non-linearly to
 * raw amplitude, with nearly all the audible range compressed into a small
 * slice near zero. A cubic mapping (the same technique PipeWire's own
 * volume UI uses internally in many configs, not invented here) spreads
 * that perceptual range back across the slider: `raw = perceptual^3` going
 * out, `perceptual = raw^(1/3)` coming back, so a linear HA slider
 * position corresponds to a roughly linear perceived loudness instead of
 * a roughly linear raw amplitude. Exact exponent is a reasonable starting
 * point for this known class of problem, not empirically tuned to this
 * specific speaker -- may need adjusting based on how it actually sounds.
 */
const PERCEPTUAL_CURVE_EXPONENT = 3;

export function perceptualToRawVolume(perceptual: number): number {
  const clamped = Math.max(0, Math.min(1, perceptual));
  return clamped ** PERCEPTUAL_CURVE_EXPONENT;
}

export function rawToPerceptualVolume(raw: number): number {
  const clamped = Math.max(0, Math.min(1, raw));
  return clamped ** (1 / PERCEPTUAL_CURVE_EXPONENT);
}

/**
 * Controls the system/PipeWire output level via wpctl -- not pianobar's own
 * internal gain (act_voldown/act_volup/act_volreset, driven over the FIFO),
 * which only supports relative nudges and has no absolute "set to X" concept
 * (see commands.ts and bridge-daemon-spec.md's note on what "volume" means
 * per backend). This is the same mechanism the ad hoc TheFlea media_player
 * integration already proved works for a real HA volume slider
 * (`mediaplayer-mqtt-bridge.py`'s get_volume/set_volume).
 */
export const wpctlSystemVolume: SystemVolumeOps = {
  async getVolume() {
    try {
      const { stdout } = await execFileAsync("wpctl", ["get-volume", DEFAULT_SINK], { timeout: WPCTL_TIMEOUT_MS });
      // "Volume: 0.46" or "Volume: 0.46 [MUTED]"
      const match = /Volume:\s*([\d.]+)/.exec(stdout);
      return match?.[1] === undefined ? undefined : Number(match[1]);
    } catch {
      return undefined;
    }
  },

  async setVolume(level) {
    const clamped = Math.max(0, Math.min(1, level));
    await execFileAsync("wpctl", ["set-volume", DEFAULT_SINK, clamped.toFixed(2)], { timeout: WPCTL_TIMEOUT_MS });
  },
};

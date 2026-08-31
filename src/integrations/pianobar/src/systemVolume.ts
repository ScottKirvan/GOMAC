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

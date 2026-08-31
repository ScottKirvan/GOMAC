import { afterEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.fn();

vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => {
    const callback = args[args.length - 1] as (err: Error | null, result?: { stdout: string; stderr: string }) => void;
    execFileMock(...args.slice(0, -1))
      .then((result: { stdout: string; stderr: string }) => callback(null, result))
      .catch((err: Error) => callback(err));
  },
}));

describe("wpctlSystemVolume", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("parses the volume from wpctl's plain output", async () => {
    execFileMock.mockResolvedValue({ stdout: "Volume: 0.46\n", stderr: "" });
    const { wpctlSystemVolume } = await import("../src/systemVolume.js");

    expect(await wpctlSystemVolume.getVolume()).toBe(0.46);
    expect(execFileMock).toHaveBeenCalledWith("wpctl", ["get-volume", "@DEFAULT_AUDIO_SINK@"], expect.anything());
  });

  it("parses the volume even when muted", async () => {
    execFileMock.mockResolvedValue({ stdout: "Volume: 0.46 [MUTED]\n", stderr: "" });
    const { wpctlSystemVolume } = await import("../src/systemVolume.js");

    expect(await wpctlSystemVolume.getVolume()).toBe(0.46);
  });

  it("returns undefined rather than throwing when wpctl fails", async () => {
    execFileMock.mockRejectedValue(new Error("wpctl: command not found"));
    const { wpctlSystemVolume } = await import("../src/systemVolume.js");

    expect(await wpctlSystemVolume.getVolume()).toBeUndefined();
  });

  it("returns undefined when wpctl's output doesn't match the expected shape", async () => {
    execFileMock.mockResolvedValue({ stdout: "unexpected output\n", stderr: "" });
    const { wpctlSystemVolume } = await import("../src/systemVolume.js");

    expect(await wpctlSystemVolume.getVolume()).toBeUndefined();
  });

  it("sets volume formatted to two decimal places", async () => {
    execFileMock.mockResolvedValue({ stdout: "", stderr: "" });
    const { wpctlSystemVolume } = await import("../src/systemVolume.js");

    await wpctlSystemVolume.setVolume(0.5);

    expect(execFileMock).toHaveBeenCalledWith("wpctl", ["set-volume", "@DEFAULT_AUDIO_SINK@", "0.50"], expect.anything());
  });

  it("clamps values above 1 and below 0 before setting", async () => {
    execFileMock.mockResolvedValue({ stdout: "", stderr: "" });
    const { wpctlSystemVolume } = await import("../src/systemVolume.js");

    await wpctlSystemVolume.setVolume(1.5);
    expect(execFileMock).toHaveBeenCalledWith("wpctl", ["set-volume", "@DEFAULT_AUDIO_SINK@", "1.00"], expect.anything());

    await wpctlSystemVolume.setVolume(-0.5);
    expect(execFileMock).toHaveBeenCalledWith("wpctl", ["set-volume", "@DEFAULT_AUDIO_SINK@", "0.00"], expect.anything());
  });

  it("propagates the error rather than swallowing it when setVolume fails", async () => {
    execFileMock.mockRejectedValue(new Error("wpctl: no such sink"));
    const { wpctlSystemVolume } = await import("../src/systemVolume.js");

    await expect(wpctlSystemVolume.setVolume(0.5)).rejects.toThrow("wpctl: no such sink");
  });
});

describe("perceptual/raw volume curve", () => {
  it("maps 0 and 1 to themselves at both ends", async () => {
    const { perceptualToRawVolume, rawToPerceptualVolume } = await import("../src/systemVolume.js");

    expect(perceptualToRawVolume(0)).toBe(0);
    expect(perceptualToRawVolume(1)).toBe(1);
    expect(rawToPerceptualVolume(0)).toBe(0);
    expect(rawToPerceptualVolume(1)).toBe(1);
  });

  it("compresses the low end of the perceptual range into a smaller raw value (the actual bug this fixes)", async () => {
    const { perceptualToRawVolume } = await import("../src/systemVolume.js");

    // A mid-range perceptual position should map to a raw value well
    // below it -- this is the whole point: raw amplitude around 0.5 was
    // observed to already sound near-maximum on the affected hardware.
    expect(perceptualToRawVolume(0.5)).toBeCloseTo(0.125, 5);
  });

  it("round-trips perceptual -> raw -> perceptual", async () => {
    const { perceptualToRawVolume, rawToPerceptualVolume } = await import("../src/systemVolume.js");

    for (const value of [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1]) {
      expect(rawToPerceptualVolume(perceptualToRawVolume(value))).toBeCloseTo(value, 5);
    }
  });

  it("clamps out-of-range inputs on both functions", async () => {
    const { perceptualToRawVolume, rawToPerceptualVolume } = await import("../src/systemVolume.js");

    expect(perceptualToRawVolume(1.5)).toBe(1);
    expect(perceptualToRawVolume(-0.5)).toBe(0);
    expect(rawToPerceptualVolume(1.5)).toBe(1);
    expect(rawToPerceptualVolume(-0.5)).toBe(0);
  });
});

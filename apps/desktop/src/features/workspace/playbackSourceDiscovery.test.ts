import { describe, expect, it, vi } from "vitest";
import { discoverPlaybackSourceOptions } from "./playbackSourceDiscovery";

const fullMix = "bandscope-project://project-100-1";
const stems = [
  `${fullMix}/stem/vocals`,
  `${fullMix}/stem/bass`,
  `${fullMix}/stem/drums`,
  `${fullMix}/stem/other`,
] as const;

describe("playback source native discovery", () => {
  it("invokes the native availability command with only the current opaque full-mix authority", async () => {
    const invokeCommand = vi.fn().mockResolvedValue([
      stems[3],
      fullMix,
      stems[1],
      stems[0],
      stems[2],
    ]);

    await expect(
      discoverPlaybackSourceOptions(fullMix, invokeCommand),
    ).resolves.toEqual([
      { kind: "full_mix", authority: fullMix },
      { kind: "vocals", authority: stems[0] },
      { kind: "bass", authority: stems[1] },
      { kind: "drums", authority: stems[2] },
      { kind: "other", authority: stems[3] },
    ]);
    expect(invokeCommand).toHaveBeenCalledTimes(1);
    expect(invokeCommand).toHaveBeenCalledWith(
      "get_playback_source_availability",
      { currentFullMixAuthority: fullMix },
    );
  });

  it("keeps full mix usable when native authority has no registered stems", async () => {
    const invokeCommand = vi.fn().mockResolvedValue([fullMix]);

    await expect(
      discoverPlaybackSourceOptions(fullMix, invokeCommand),
    ).resolves.toEqual([{ kind: "full_mix", authority: fullMix }]);
  });

  it.each([
    ["partial stem set", [fullMix, stems[0], stems[1]]],
    ["stale project", ["bandscope-project://project-101-2"]],
    ["native path", [fullMix, "/private/tmp/vocals.wav"]],
    ["malformed payload", { fullMix }],
  ])("fails closed on %s returned by IPC", async (_label, payload) => {
    const invokeCommand = vi.fn().mockResolvedValue(payload);

    await expect(
      discoverPlaybackSourceOptions(fullMix, invokeCommand),
    ).resolves.toBeNull();
  });

  it("fails closed without echoing native invocation failures", async () => {
    const invokeCommand = vi
      .fn()
      .mockRejectedValue(new Error("/private/tmp/secret-source.wav"));

    await expect(
      discoverPlaybackSourceOptions(fullMix, invokeCommand),
    ).resolves.toBeNull();
  });

  it.each([null, undefined, "file:///private/tmp/source.wav", `${fullMix}/stem/vocals`])(
    "does not invoke native discovery for a non-full-mix authority: %s",
    async (candidate) => {
      const invokeCommand = vi.fn().mockResolvedValue([fullMix]);

      await expect(
        discoverPlaybackSourceOptions(candidate, invokeCommand),
      ).resolves.toBeNull();
      expect(invokeCommand).not.toHaveBeenCalled();
    },
  );
});

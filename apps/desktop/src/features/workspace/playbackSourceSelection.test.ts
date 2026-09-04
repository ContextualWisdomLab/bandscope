import { describe, expect, it } from "vitest";
import {
  derivePlaybackSourceOptions,
  playbackSourceProjectId,
} from "./playbackSourceSelection";

const fullMix = "bandscope-project://project-100-1";
const stems = {
  vocals: `${fullMix}/stem/vocals`,
  bass: `${fullMix}/stem/bass`,
  drums: `${fullMix}/stem/drums`,
  other: `${fullMix}/stem/other`,
} as const;

describe("playback source selection authority", () => {
  it("projects one complete native authority set into canonical rehearsal order", () => {
    expect(
      derivePlaybackSourceOptions(fullMix, [
        stems.other,
        stems.drums,
        fullMix,
        stems.vocals,
        stems.bass,
      ]),
    ).toEqual([
      { kind: "full_mix", authority: fullMix },
      { kind: "vocals", authority: stems.vocals },
      { kind: "bass", authority: stems.bass },
      { kind: "drums", authority: stems.drums },
      { kind: "other", authority: stems.other },
    ]);
  });

  it("keeps full mix usable while no generated stems are registered", () => {
    expect(derivePlaybackSourceOptions(fullMix, [fullMix])).toEqual([
      { kind: "full_mix", authority: fullMix },
    ]);
  });

  it("fails closed when native availability claims only part of the atomic four-stem set", () => {
    expect(
      derivePlaybackSourceOptions(fullMix, [fullMix, stems.vocals, stems.bass]),
    ).toBeNull();
  });

  it.each([
    ["duplicate authority", [fullMix, fullMix]],
    [
      "mismatched project",
      [fullMix, "bandscope-project://project-101-2/stem/vocals"],
    ],
    ["unknown stem", [fullMix, `${fullMix}/stem/guitar`]],
    ["path-shaped suffix", [fullMix, `${fullMix}/stem/vocals/../private.wav`]],
    ["non-string entry", [fullMix, 42]],
    ["non-array payload", { fullMix }],
  ])("rejects %s instead of inventing a buyer-visible source", (_label, payload) => {
    expect(derivePlaybackSourceOptions(fullMix, payload)).toBeNull();
  });

  it("rejects stale availability after the current project authority rotates", () => {
    expect(
      derivePlaybackSourceOptions("bandscope-project://project-101-2", [
        fullMix,
        stems.vocals,
        stems.bass,
        stems.drums,
        stems.other,
      ]),
    ).toBeNull();
  });

  it("extracts project identity only from canonical opaque playback authorities", () => {
    expect(playbackSourceProjectId(fullMix)).toBe("project-100-1");
    expect(playbackSourceProjectId(stems.other)).toBe("project-100-1");
    for (const invalid of [
      null,
      42,
      "file:///private/source.wav",
      "bandscope-project://project-100-1/stem/guitar",
      `${stems.vocals}/../private.wav`,
    ]) {
      expect(playbackSourceProjectId(invalid)).toBeNull();
    }
  });
});

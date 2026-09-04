import { createDemoRehearsalSong, type RehearsalSection } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstHarmonicFunction } from "./firstHarmonicFunction";

describe("resolveFirstHarmonicFunction section-label authority", () => {
  it("rejects an unsupported nonblank runtime section label", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.label = "unsupported-runtime-label" as RehearsalSection["label"];

    expect(resolveFirstHarmonicFunction(song)).toBeNull();
  });
});

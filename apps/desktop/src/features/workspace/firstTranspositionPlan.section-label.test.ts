import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstTranspositionPlan } from "./firstTranspositionPlan";

describe("resolveFirstTranspositionPlan section-label authority", () => {
  it("fails closed when runtime metadata supplies a label outside the shared SectionFormLabel contract", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections[0]!;
    expect(resolveFirstTranspositionPlan(song)?.section.id).toBe(section.id);

    (section as unknown as { label: string }).label = "verse-legacy";

    expect(resolveFirstTranspositionPlan(song)).toBeNull();
  });
});

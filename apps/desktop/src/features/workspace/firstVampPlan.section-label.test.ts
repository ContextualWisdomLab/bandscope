import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstVampPlan } from "./firstVampPlan";

describe("resolveFirstVampPlan section-label authority", () => {
  it("fails closed when runtime metadata supplies a label outside the shared SectionFormLabel contract", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections[0]!;

    (section as unknown as { label: string }).label = "verse-legacy";

    expect(resolveFirstVampPlan(song)).toBeNull();
  });
});

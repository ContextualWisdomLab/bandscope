import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstDynamicsPlan } from "./firstDynamicsPlan";

describe("resolveFirstDynamicsPlan section-label authority", () => {
  it("fails closed when runtime metadata supplies a label outside the shared SectionFormLabel contract", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections[0]!;

    (section as unknown as { label: string }).label = "verse-legacy";

    expect(resolveFirstDynamicsPlan(song)).toBeNull();
  });
});

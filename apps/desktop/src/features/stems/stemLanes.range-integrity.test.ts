import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { collectStemLanes } from "./stemLanes";

describe("collectStemLanes range integrity", () => {
  it("does not widen a playable range with a contradictory section range", () => {
    const song = createDemoRehearsalSong();
    const firstSection = structuredClone(song.sections[0]);
    const secondSection = structuredClone(song.sections[0]);

    firstSection.id = "verse-1";
    firstSection.label = "verse";
    firstSection.roles = [
      {
        ...firstSection.roles[0],
        id: "range-integrity-role",
        range: { lowestNote: "A2", highestNote: "C4" }
      }
    ];

    secondSection.id = "chorus-1";
    secondSection.label = "chorus";
    secondSection.roles = [
      {
        ...secondSection.roles[0],
        id: "range-integrity-role",
        range: { lowestNote: "A0", highestNote: "C-1" }
      }
    ];

    song.sections = [firstSection, secondSection];

    const lane = collectStemLanes(song)[0];
    expect(lane.lowestNote).toBe("A2");
    expect(lane.highestNote).toBe("C4");
  });
});

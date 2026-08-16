import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { collectStemLanes } from "./stemLanes";

describe("collectStemLanes range ordering", () => {
  it("fails closed when validated range boundaries are inverted", () => {
    const song = createDemoRehearsalSong();
    song.sections = [
      {
        ...song.sections[0],
        roles: [
          {
            ...song.sections[0].roles[0],
            id: "inverted-range",
            range: { lowestNote: "G5", highestNote: "C4" }
          }
        ]
      }
    ];

    const lane = collectStemLanes(song)[0];
    expect(lane.lowestNote).toBe("");
    expect(lane.highestNote).toBe("");
  });
});

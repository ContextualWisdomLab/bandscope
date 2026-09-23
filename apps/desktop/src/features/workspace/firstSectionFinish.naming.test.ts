import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import {
  firstSectionFinish,
  formatSectionFinishTime
} from "./firstSectionFinish";

describe("first-section-finish ubiquitous language", () => {
  it("exposes structural section-finish evidence without inventing a breath event", () => {
    expect(formatSectionFinishTime(30)).toBe("0:30");
    expect(firstSectionFinish(createDemoRehearsalSong())).toEqual({
      sectionLabel: "verse",
      endTime: "0:30"
    });
  });
});

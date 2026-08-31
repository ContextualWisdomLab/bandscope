import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { firstComeIn } from "./firstComeIn";

function songWithSameSectionConflict(reverse: boolean): RehearsalSong {
  const seed = createDemoRehearsalSong();
  const template = seed.sections[0]!;
  const bass = template.partGraph.find((node) => node.role_id === "bass-guitar")!;
  const others = template.partGraph.filter((node) => node.role_id !== "bass-guitar");
  const inactiveBass = { ...bass, is_active: false };
  const activeBass = { ...bass, is_active: true };
  const conflict = {
    ...template,
    id: "verse-conflict",
    label: "verse" as RehearsalSong["sections"][number]["label"],
    timeRange: { start: 0, end: 20 },
    partGraph: [
      ...others,
      ...(reverse ? [activeBass, inactiveBass] : [inactiveBass, activeBass])
    ]
  };
  const later = {
    ...template,
    id: "verse-later",
    label: "verse" as RehearsalSong["sections"][number]["label"],
    timeRange: { start: 20, end: 40 }
  };
  return { ...seed, sections: [conflict, later] };
}

describe("firstComeIn conflicting section evidence", () => {
  it("fails closed for false/true and true/false duplicates before a later active section", () => {
    for (const reverse of [false, true]) {
      expect(firstComeIn(songWithSameSectionConflict(reverse), "bass-guitar")).toBeNull();
    }
  });
});

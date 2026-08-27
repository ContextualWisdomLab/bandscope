import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstBreakdownPlan } from "./firstBreakdownPlan";

describe("resolveFirstBreakdownPlan section-label authority", () => {
  it("fails closed when runtime metadata supplies a label outside the shared SectionFormLabel contract", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    const chorus = structuredClone(verse);
    chorus.id = "chorus-1";
    chorus.label = "chorus";
    chorus.timeRange = { start: verse.timeRange.end, end: verse.timeRange.end + 16 };
    const bass = chorus.roles.find((role) => role.id === "bass-guitar")!;
    bass.breakdownPlan = "Hold this breakdown; keep it sparse until the drop.";
    chorus.partGraph = chorus.partGraph.map((node) => ({
      ...node,
      is_active: node.role_id === "bass-guitar"
    }));
    song.sections = [verse, chorus];
    (chorus as unknown as { label: string }).label = "chorus-legacy";

    expect(resolveFirstBreakdownPlan(song)).toBeNull();
  });
});

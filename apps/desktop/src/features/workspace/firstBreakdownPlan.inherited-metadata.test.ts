import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstBreakdownPlan } from "./firstBreakdownPlan";

function songWithBreakdownPlan() {
  const song = createDemoRehearsalSong();
  const verse = structuredClone(song.sections[0]!);
  const chorus = structuredClone(verse);
  chorus.id = "chorus-own";
  chorus.label = "chorus";
  chorus.timeRange = { start: verse.timeRange.end, end: verse.timeRange.end + 16 };
  const bass = chorus.roles.find((role) => role.id === "bass-guitar")!;
  bass.breakdownPlan = "Hold this breakdown; keep it sparse until the drop.";
  bass.breakdownPlanSource = "model";
  chorus.partGraph = chorus.partGraph.map((node) => ({
    ...node,
    is_active: node.role_id === "bass-guitar"
  }));
  song.sections = [verse, chorus];
  return { song, chorus, verse };
}

describe("resolveFirstBreakdownPlan inherited metadata", () => {
  it("rejects a song or section whose required metadata is inherited", () => {
    const { song, chorus } = songWithBreakdownPlan();
    const inheritedSong = Object.create(song) as typeof song;
    expect(resolveFirstBreakdownPlan(inheritedSong)).toBeNull();

    const inheritedSection = Object.create(chorus) as typeof chorus;
    song.sections[1] = inheritedSection;
    expect(resolveFirstBreakdownPlan(song)).toBeNull();
  });

  it("rejects a role whose identity is inherited instead of owned", () => {
    const { song, chorus } = songWithBreakdownPlan();
    const role = chorus.roles.find((candidate) => candidate.id === "bass-guitar")!;
    const inheritedRole = Object.create(role) as typeof role;
    chorus.roles = chorus.roles.map((candidate) =>
      candidate.id === role.id ? inheritedRole : candidate
    );
    expect(resolveFirstBreakdownPlan(song)).toBeNull();
  });
});

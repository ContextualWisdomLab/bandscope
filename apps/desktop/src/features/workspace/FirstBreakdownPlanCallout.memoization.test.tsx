import { render } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstBreakdownPlanCallout } from "./FirstBreakdownPlanCallout";

function songWithBreakdownPlan() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const chorus = structuredClone(verse);
  chorus.id = "chorus-1";
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
  return song;
}

describe("FirstBreakdownPlanCallout resolver reuse", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not rescan role metadata when a parent rerenders the same song object", () => {
    const song = songWithBreakdownPlan();
    const role = song.sections[1]!.roles.find((candidate) => candidate.id === "bass-guitar")!;
    const descriptorSpy = vi.spyOn(Object, "getOwnPropertyDescriptor");

    const { rerender } = render(<FirstBreakdownPlanCallout song={song} />);
    const firstScanCount = descriptorSpy.mock.calls.filter(([target]) => target === role).length;
    expect(firstScanCount).toBeGreaterThan(0);

    rerender(<FirstBreakdownPlanCallout song={song} />);
    const secondScanCount = descriptorSpy.mock.calls.filter(([target]) => target === role).length;

    expect(secondScanCount).toBe(firstScanCount);
  });
});

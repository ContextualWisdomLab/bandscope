import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
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
  chorus.partGraph = chorus.partGraph.map((node) => ({
    ...node,
    is_active: node.role_id === "bass-guitar"
  }));
  song.sections = [verse, chorus];
  return song;
}

describe("FirstBreakdownPlanCallout navigation failure", () => {
  it("tells the user when the named breakdown cannot be opened on the rendered map", () => {
    render(<FirstBreakdownPlanCallout song={songWithBreakdownPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar breakdown at 0:30" }));

    expect(
      screen.getByText(
        "Could not open this breakdown on the song map. Use the map below to find the section."
      )
    ).toBeTruthy();
    expect(screen.queryByText(/Keep Bass Guitar sparse at 0:30 until the drop./)).toBeNull();
  });
});

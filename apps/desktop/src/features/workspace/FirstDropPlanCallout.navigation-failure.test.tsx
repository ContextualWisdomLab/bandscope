import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { FirstDropPlanCallout } from "./FirstDropPlanCallout";

function songWithDropPlan() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  verse.partGraph = verse.partGraph.map((node) => ({
    ...node,
    is_active: node.role_id === "bass-guitar" || node.role_id === "keys-right"
  }));
  const chorus = structuredClone(verse);
  chorus.id = "chorus-1";
  chorus.label = "chorus";
  chorus.timeRange = { start: verse.timeRange.end, end: verse.timeRange.end + 16 };
  chorus.partGraph = chorus.partGraph.map((node) => ({ ...node, is_active: true }));
  const vocal = chorus.roles.find((role) => role.id === "lead-vocal")!;
  vocal.dropPlan = "Hit this drop; come in together when the texture fills.";
  vocal.dropPlanSource = "model";
  song.sections = [verse, chorus];
  return song;
}

describe("FirstDropPlanCallout navigation failure", () => {
  it("names the next action when the rendered map target is missing", () => {
    render(<FirstDropPlanCallout song={songWithDropPlan()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal drop at 0:30" }));
    expect(
      screen.getByRole("status").textContent
    ).toBe("Could not open this drop on the song map. Use the map below to find the section.");
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { FirstFadePlanCallout } from "./FirstFadePlanCallout";

function songWithFadePlan() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  verse.partGraph = verse.partGraph.map((node) => ({ ...node, is_active: true }));
  const chorus = structuredClone(verse);
  chorus.id = "chorus-1";
  chorus.label = "chorus";
  chorus.timeRange = { start: verse.timeRange.end, end: verse.timeRange.end + 16 };
  chorus.partGraph = chorus.partGraph.map((node) => ({ ...node, is_active: true }));
  const vocal = chorus.roles.find((role) => role.id === "lead-vocal")!;
  vocal.fadePlan = "Fade this part; let the next downbeat land quieter.";
  vocal.fadePlanSource = "model";
  song.sections = [verse, chorus];
  return song;
}

describe("FirstFadePlanCallout navigation failure", () => {
  it("names the next action when the rendered map target is missing", () => {
    render(<FirstFadePlanCallout song={songWithFadePlan()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal fade at 0:30" }));
    expect(
      screen.getByRole("status").textContent
    ).toBe("Could not open this fade on the song map. Use the map below to find the section.");
  });
});

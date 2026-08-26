import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { FirstPickupPlanCallout } from "./FirstPickupPlanCallout";

function songWithPickupPlan() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const intro = structuredClone(verse);
  intro.id = "intro-1";
  intro.label = "intro";
  intro.timeRange = { start: 0, end: verse.timeRange.start };
  intro.roles = intro.roles.map((role) => {
    const clone = { ...role };
    delete clone.pickupPlan;
    delete clone.pickupPlanSource;
    return clone;
  });
  intro.partGraph = intro.partGraph.map((node) => ({
    ...node,
    is_active: node.role_id !== "bass-guitar"
  }));
  song.sections = [intro, verse];
  return song;
}

describe("FirstPickupPlanCallout navigation failure", () => {
  it("tells the user when the named pickup cannot be opened on the rendered map", () => {
    render(<FirstPickupPlanCallout song={songWithPickupPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar pickup at 0:10" }));

    expect(
      screen.getByText(
        "Could not open this pickup on the song map. Use the map below to find the section."
      )
    ).toBeTruthy();
    expect(
      screen.queryByText(/Play that pickup on Bass Guitar at 0:10 before the downbeat lands./)
    ).toBeNull();
  });
});

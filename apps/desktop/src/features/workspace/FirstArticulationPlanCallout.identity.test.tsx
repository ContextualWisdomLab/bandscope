import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { expect, it } from "vitest";
import { FirstArticulationPlanCallout } from "./FirstArticulationPlanCallout";

it("gives co-mounted articulation-plan callouts distinct DOM identities", () => {
  render(
    <>
      <FirstArticulationPlanCallout song={createDemoRehearsalSong()} />
      <FirstArticulationPlanCallout song={createDemoRehearsalSong()} />
    </>
  );

  const callouts = screen.getAllByRole("complementary", {
    name: "Tonight's first articulation plan"
  });
  const ids = callouts.map((callout) => callout.id);

  expect(ids.every((id) => id.length > 0)).toBe(true);
  expect(new Set(ids).size).toBe(callouts.length);
});

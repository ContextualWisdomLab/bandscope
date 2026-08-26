import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { expect, it } from "vitest";
import { FirstTurnaroundPlanCallout } from "./FirstTurnaroundPlanCallout";

it("gives co-mounted turnaround-plan callouts distinct DOM identities", () => {
  render(
    <>
      <FirstTurnaroundPlanCallout song={createDemoRehearsalSong()} />
      <FirstTurnaroundPlanCallout song={createDemoRehearsalSong()} />
    </>
  );

  const callouts = screen.getAllByRole("complementary", {
    name: "Tonight's first turnaround plan"
  });
  const ids = callouts.map((callout) => callout.id);

  expect(ids.every((id) => id.length > 0)).toBe(true);
  expect(new Set(ids).size).toBe(callouts.length);
});

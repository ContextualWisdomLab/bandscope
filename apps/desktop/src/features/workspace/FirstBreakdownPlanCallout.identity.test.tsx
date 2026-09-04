import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { expect, it } from "vitest";
import { FirstBreakdownPlanCallout } from "./FirstBreakdownPlanCallout";

it("gives co-mounted breakdown-plan callouts distinct DOM identities", () => {
  render(
    <>
      <FirstBreakdownPlanCallout song={createDemoRehearsalSong()} />
      <FirstBreakdownPlanCallout song={createDemoRehearsalSong()} />
    </>
  );

  const callouts = screen.getAllByRole("complementary", {
    name: "Tonight's first breakdown plan"
  });
  const ids = callouts.map((callout) => callout.id);

  expect(ids.every((id) => id.length > 0)).toBe(true);
  expect(new Set(ids).size).toBe(callouts.length);
});

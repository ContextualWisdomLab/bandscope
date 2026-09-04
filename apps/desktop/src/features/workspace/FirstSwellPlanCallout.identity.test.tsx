import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { expect, it } from "vitest";
import { FirstSwellPlanCallout } from "./FirstSwellPlanCallout";

it("gives co-mounted swell-plan callouts distinct DOM identities", () => {
  render(
    <>
      <FirstSwellPlanCallout song={createDemoRehearsalSong()} />
      <FirstSwellPlanCallout song={createDemoRehearsalSong()} />
    </>
  );

  const callouts = screen.getAllByRole("complementary", {
    name: "Tonight's first swell plan"
  });
  const ids = callouts.map((callout) => callout.id);

  expect(ids.every((id) => id.length > 0)).toBe(true);
  expect(new Set(ids).size).toBe(callouts.length);
});

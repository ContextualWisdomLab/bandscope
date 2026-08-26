import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { expect, it } from "vitest";
import { FirstPickupPlanCallout } from "./FirstPickupPlanCallout";

it("gives co-mounted pickup-plan callouts distinct DOM identities", () => {
  render(
    <>
      <FirstPickupPlanCallout song={createDemoRehearsalSong()} />
      <FirstPickupPlanCallout song={createDemoRehearsalSong()} />
    </>
  );

  const callouts = screen.getAllByRole("complementary", {
    name: "Tonight's first pickup plan"
  });
  const ids = callouts.map((callout) => callout.id);

  expect(ids.every((id) => id.length > 0)).toBe(true);
  expect(new Set(ids).size).toBe(callouts.length);
});

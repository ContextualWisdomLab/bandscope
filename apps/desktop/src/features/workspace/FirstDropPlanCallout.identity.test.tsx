import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { expect, it } from "vitest";
import { FirstDropPlanCallout } from "./FirstDropPlanCallout";

it("gives co-mounted drop-plan callouts distinct DOM identities", () => {
  render(
    <>
      <FirstDropPlanCallout song={createDemoRehearsalSong()} />
      <FirstDropPlanCallout song={createDemoRehearsalSong()} />
    </>
  );

  const callouts = screen.getAllByRole("complementary", {
    name: "Tonight's first drop plan"
  });
  const ids = callouts.map((callout) => callout.id);

  expect(ids.every((id) => id.length > 0)).toBe(true);
  expect(new Set(ids).size).toBe(callouts.length);
});

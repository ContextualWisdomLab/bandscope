import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { expect, it } from "vitest";
import { FirstFillPlanCallout } from "./FirstFillPlanCallout";

it("gives co-mounted fill-plan callouts distinct DOM identities", () => {
  render(
    <>
      <FirstFillPlanCallout song={createDemoRehearsalSong()} />
      <FirstFillPlanCallout song={createDemoRehearsalSong()} />
    </>
  );

  const callouts = screen.getAllByRole("complementary", {
    name: "Tonight's first fill plan"
  });
  const ids = callouts.map((callout) => callout.id);

  expect(ids.every((id) => id.length > 0)).toBe(true);
  expect(new Set(ids).size).toBe(callouts.length);
});

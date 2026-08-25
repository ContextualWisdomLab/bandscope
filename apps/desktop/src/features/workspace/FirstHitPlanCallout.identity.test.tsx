import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { expect, it } from "vitest";
import { FirstHitPlanCallout } from "./FirstHitPlanCallout";

it("gives co-mounted hit-plan callouts distinct DOM identities", () => {
  render(
    <>
      <FirstHitPlanCallout song={createDemoRehearsalSong()} />
      <FirstHitPlanCallout song={createDemoRehearsalSong()} />
    </>
  );

  const callouts = screen.getAllByRole("complementary", {
    name: "Tonight's first hit plan"
  });
  const ids = callouts.map((callout) => callout.id);

  expect(ids.every((id) => id.length > 0)).toBe(true);
  expect(new Set(ids).size).toBe(callouts.length);
});

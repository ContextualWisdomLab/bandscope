import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { expect, it } from "vitest";
import { FirstHookPlanCallout } from "./FirstHookPlanCallout";

it("gives co-mounted hook-plan callouts distinct DOM identities", () => {
  render(
    <>
      <FirstHookPlanCallout song={createDemoRehearsalSong()} />
      <FirstHookPlanCallout song={createDemoRehearsalSong()} />
    </>
  );

  const callouts = screen.getAllByRole("complementary", {
    name: "Tonight's first hook plan"
  });
  const ids = callouts.map((callout) => callout.id);

  expect(ids.every((id) => id.length > 0)).toBe(true);
  expect(new Set(ids).size).toBe(callouts.length);
});

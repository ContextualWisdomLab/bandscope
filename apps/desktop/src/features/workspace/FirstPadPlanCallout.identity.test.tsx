import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { expect, it } from "vitest";
import { FirstPadPlanCallout } from "./FirstPadPlanCallout";

it("gives co-mounted pad-plan callouts distinct DOM identities", () => {
  render(
    <>
      <FirstPadPlanCallout song={createDemoRehearsalSong()} />
      <FirstPadPlanCallout song={createDemoRehearsalSong()} />
    </>
  );

  const callouts = screen.getAllByRole("complementary", {
    name: "Tonight's first pad plan"
  });
  const ids = callouts.map((callout) => callout.id);

  expect(ids.every((id) => id.length > 0)).toBe(true);
  expect(new Set(ids).size).toBe(callouts.length);
});

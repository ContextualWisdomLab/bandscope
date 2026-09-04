import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { expect, it } from "vitest";
import { FirstRiffPlanCallout } from "./FirstRiffPlanCallout";

it("gives co-mounted riff-plan callouts distinct DOM identities", () => {
  render(
    <>
      <FirstRiffPlanCallout song={createDemoRehearsalSong()} />
      <FirstRiffPlanCallout song={createDemoRehearsalSong()} />
    </>
  );

  const callouts = screen.getAllByRole("complementary", {
    name: "Tonight's first riff plan"
  });
  const ids = callouts.map((callout) => callout.id);

  expect(ids.every((id) => id.length > 0)).toBe(true);
  expect(new Set(ids).size).toBe(callouts.length);
});

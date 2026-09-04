import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { expect, it } from "vitest";
import { FirstVoicingPlanCallout } from "./FirstVoicingPlanCallout";

it("gives co-mounted voicing-plan callouts distinct DOM identities", () => {
  render(
    <>
      <FirstVoicingPlanCallout song={createDemoRehearsalSong()} />
      <FirstVoicingPlanCallout song={createDemoRehearsalSong()} />
    </>
  );

  const callouts = screen.getAllByRole("complementary", {
    name: "Tonight's first voicing plan"
  });
  const ids = callouts.map((callout) => callout.id);

  expect(ids.every((id) => id.length > 0)).toBe(true);
  expect(new Set(ids).size).toBe(callouts.length);
});

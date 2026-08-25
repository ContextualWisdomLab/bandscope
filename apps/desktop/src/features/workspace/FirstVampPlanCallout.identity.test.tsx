import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { expect, it } from "vitest";
import { FirstVampPlanCallout } from "./FirstVampPlanCallout";

it("gives co-mounted vamp-plan callouts distinct DOM identities", () => {
  render(
    <>
      <FirstVampPlanCallout song={createDemoRehearsalSong()} />
      <FirstVampPlanCallout song={createDemoRehearsalSong()} />
    </>
  );

  const callouts = screen.getAllByRole("complementary", {
    name: "Tonight's first vamp plan"
  });
  const ids = callouts.map((callout) => callout.id);

  expect(ids.every((id) => id.length > 0)).toBe(true);
  expect(new Set(ids).size).toBe(callouts.length);
});

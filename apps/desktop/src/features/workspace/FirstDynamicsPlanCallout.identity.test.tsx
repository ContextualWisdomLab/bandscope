import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { expect, it } from "vitest";
import { FirstDynamicsPlanCallout } from "./FirstDynamicsPlanCallout";

it("gives co-mounted dynamics-plan callouts distinct DOM identities", () => {
  render(
    <>
      <FirstDynamicsPlanCallout song={createDemoRehearsalSong()} />
      <FirstDynamicsPlanCallout song={createDemoRehearsalSong()} />
    </>
  );

  const callouts = screen.getAllByRole("complementary", {
    name: "Tonight's first dynamics plan"
  });
  const ids = callouts.map((callout) => callout.id);

  expect(ids.every((id) => id.length > 0)).toBe(true);
  expect(new Set(ids).size).toBe(callouts.length);
});

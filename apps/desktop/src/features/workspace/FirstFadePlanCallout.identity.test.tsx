import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { expect, it } from "vitest";
import { FirstFadePlanCallout } from "./FirstFadePlanCallout";

it("gives co-mounted fade-plan callouts distinct DOM identities", () => {
  render(
    <>
      <FirstFadePlanCallout song={createDemoRehearsalSong()} />
      <FirstFadePlanCallout song={createDemoRehearsalSong()} />
    </>
  );

  const callouts = screen.getAllByRole("complementary", {
    name: "Tonight's first fade plan"
  });
  const ids = callouts.map((callout) => callout.id);

  expect(ids.every((id) => id.length > 0)).toBe(true);
  expect(new Set(ids).size).toBe(callouts.length);
});

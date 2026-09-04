import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { expect, it } from "vitest";
import { FirstTransitionCallout } from "./FirstTransitionCallout";

it("keeps the transition landmark name concise when guidance is unavailable", () => {
  const song = createDemoRehearsalSong();
  song.sections = [];

  render(<FirstTransitionCallout song={song} />);

  expect(
    screen.getByRole("complementary", { name: "Tonight's first transition" })
  ).toBeTruthy();
  expect(
    screen.getByText("No transition cue yet. Stay on tonight's map until a change is named.")
  ).toBeTruthy();
});

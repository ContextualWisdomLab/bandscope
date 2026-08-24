import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { expect, it } from "vitest";
import { FirstEarCheckCallout } from "./FirstEarCheckCallout";

it("contains a hostile song sections accessor instead of crashing the callout", () => {
  const song = createDemoRehearsalSong();
  Object.defineProperty(song, "sections", {
    configurable: true,
    enumerable: true,
    get() {
      throw new Error("hostile song sections getter");
    }
  });

  expect(() => render(<FirstEarCheckCallout song={song as RehearsalSong} />)).not.toThrow();
  expect(
    screen.getByText(
      "Nothing still needs an ear check. Stay on tonight's map until a part is marked uncertain."
    )
  ).toBeTruthy();
});

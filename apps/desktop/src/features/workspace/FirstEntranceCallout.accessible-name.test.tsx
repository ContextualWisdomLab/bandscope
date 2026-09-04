import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { FirstEntranceCallout } from "./FirstEntranceCallout";

describe("FirstEntranceCallout accessible name", () => {
  it("keeps the concise first-entrance region name when no entrance exists", () => {
    const song = createDemoRehearsalSong();
    song.sections = [];

    render(<FirstEntranceCallout song={song} />);

    expect(
      screen.getByRole("complementary", { name: "Tonight's first entrance" })
    ).toBeTruthy();
    expect(
      screen.getByText("No first entrance yet. Stay on tonight's map until a section has a part.")
    ).toBeTruthy();
  });
});

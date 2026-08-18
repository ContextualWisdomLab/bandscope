import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { PlayerFeature } from "./index";

describe("PlayerFeature", () => {
  it("asks the room to analyze first when no song is loaded", () => {
    render(<PlayerFeature title="Player" />);
    expect(
      screen.getByText("Analyze tonight's song first, then hear the first entrance from this player.")
    ).toBeTruthy();
  });

  it("names tonight's first entrance once a song is loaded", () => {
    render(<PlayerFeature title="Player" song={createDemoRehearsalSong()} />);
    expect(screen.getByRole("button", { name: "Hear Bass Guitar enter the verse at 0:10" })).toBeTruthy();
  });
});

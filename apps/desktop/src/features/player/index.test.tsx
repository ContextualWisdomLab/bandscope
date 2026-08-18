import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { PlayerFeature } from "./index";

describe("PlayerFeature", () => {
  it("asks the room to analyze first when no song is loaded", () => {
    render(<PlayerFeature title="Player" />);
    expect(
      screen.getByText("Analyze tonight's song first, then hear the first lyric cue from this player.")
    ).toBeTruthy();
  });

  it("names tonight's first lyric cue once a song is loaded", () => {
    render(<PlayerFeature title="Player" song={createDemoRehearsalSong()} />);
    expect(
      screen.getByRole("button", {
        name: "Hear Lead Vocal enter on “city lights” in the verse at 0:10"
      })
    ).toBeTruthy();
  });
});

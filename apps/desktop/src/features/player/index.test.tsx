import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it, vi } from "vitest";
import { PlayerFeature } from "./index";

describe("PlayerFeature", () => {
  it("asks the room to analyze first when no song is loaded", () => {
    render(<PlayerFeature title="Player" />);
    expect(
      screen.getByText("Analyze tonight's song first, then hear the first lyric cue from this player.")
    ).toBeTruthy();
  });

  it("keeps the lyric hear action unavailable without a player playback callback", () => {
    render(<PlayerFeature title="Player" song={createDemoRehearsalSong()} />);

    expect(
      screen.queryByRole("button", {
        name: "Hear Lead Vocal enter on “city lights” in the verse at 0:10"
      })
    ).toBeNull();
    expect(screen.getByText("Lead Vocal enters the verse on “city lights” at 0:10.")).toBeTruthy();
  });

  it("delegates the lyric hear action to the owning player callback", () => {
    const onPlayFromSeconds = vi.fn();
    render(
      <PlayerFeature
        title="Player"
        song={createDemoRehearsalSong()}
        onPlayFromSeconds={onPlayFromSeconds}
      />
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Hear Lead Vocal enter on “city lights” in the verse at 0:10"
      })
    );

    expect(onPlayFromSeconds).toHaveBeenCalledTimes(1);
    expect(onPlayFromSeconds).toHaveBeenCalledWith(10);
  });
});
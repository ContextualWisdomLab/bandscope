import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it, vi } from "vitest";
import { PlayerFeature } from "./index";

describe("PlayerFeature", () => {
  it("asks the room to analyze first when no song is loaded", () => {
    render(<PlayerFeature title="Player" />);
    expect(
      screen.getByText("Analyze tonight's song first, then hear the first dropout from this player.")
    ).toBeTruthy();
  });

  it("keeps the dropout hear action unavailable without a player playback callback", () => {
    render(<PlayerFeature title="Player" song={createDemoRehearsalSong()} />);

    expect(
      screen.queryByRole("button", {
        name: "Hear Bass Guitar drop out for Lead Vocal at 0:30"
      })
    ).toBeNull();
    expect(screen.getByText("Bass Guitar hands off to Lead Vocal at the end of the verse (0:30).")).toBeTruthy();
  });

  it("delegates the dropout hear action to the owning player callback", () => {
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
        name: "Hear Bass Guitar drop out for Lead Vocal at 0:30"
      })
    );

    expect(onPlayFromSeconds).toHaveBeenCalledTimes(1);
    expect(onPlayFromSeconds).toHaveBeenCalledWith(30);
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it, vi } from "vitest";
import { PlayerFeature } from "./index";

describe("PlayerFeature", () => {
  it("asks the room to analyze first when no song is loaded", () => {
    render(<PlayerFeature title="Player" />);
    expect(
      screen.getByText("Analyze tonight's song first, then hear the first entrance from this player.")
    ).toBeTruthy();
  });

  it("names tonight's first entrance without a dead action when playback is unavailable", () => {
    render(<PlayerFeature title="Player" song={createDemoRehearsalSong()} />);

    expect(screen.getByText(/^Bass Guitar enters the verse at 0:10\./)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Hear Bass Guitar enter the verse at 0:10" })).toBeNull();
  });

  it("uses the player playback callback for the first entrance action", () => {
    const onPlayFromSeconds = vi.fn();
    render(
      <PlayerFeature
        title="Player"
        song={createDemoRehearsalSong()}
        onPlayFromSeconds={onPlayFromSeconds}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Hear Bass Guitar enter the verse at 0:10" }));
    expect(onPlayFromSeconds).toHaveBeenCalledTimes(1);
    expect(onPlayFromSeconds).toHaveBeenCalledWith(10);
  });
});

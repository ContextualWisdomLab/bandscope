import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it, vi } from "vitest";
import { PlayerFeature } from "./index";

function songWithStop() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const stop = structuredClone(verse);
  stop.id = "stop-1";
  stop.label = "stop";
  stop.timeRange = { start: 18, end: 19 };
  stop.roles = [
    {
      ...verse.roles[2]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high"
    }
  ];
  stop.partGraph = [
    {
      role_id: "lead-vocal",
      is_active: true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [verse, stop];
  return song;
}

describe("PlayerFeature", () => {
  it("asks the room to analyze first when no song is loaded", () => {
    render(<PlayerFeature title="Player" />);
    expect(
      screen.getByText("Analyze tonight's song first, then hear the first stop from this player.")
    ).toBeTruthy();
  });

  it("keeps the stop hear action unavailable without a player playback callback", () => {
    render(<PlayerFeature title="Player" song={songWithStop()} />);

    expect(screen.queryByRole("button", { name: "Hear Lead Vocal cut at 0:18" })).toBeNull();
    expect(screen.getByText("Lead Vocal cuts the stop at 0:18.")).toBeTruthy();
  });

  it("delegates the stop hear action to the owning player callback", () => {
    const onPlayFromSeconds = vi.fn();
    render(<PlayerFeature title="Player" song={songWithStop()} onPlayFromSeconds={onPlayFromSeconds} />);

    fireEvent.click(screen.getByRole("button", { name: "Hear Lead Vocal cut at 0:18" }));

    expect(onPlayFromSeconds).toHaveBeenCalledTimes(1);
    expect(onPlayFromSeconds).toHaveBeenCalledWith(18);
  });
});

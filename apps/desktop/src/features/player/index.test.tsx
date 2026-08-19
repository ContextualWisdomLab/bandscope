import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it, vi } from "vitest";
import { PlayerFeature } from "./index";

function songWithHandoff() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const handoff = structuredClone(verse);
  handoff.id = "handoff-1";
  handoff.label = "handoff";
  handoff.timeRange = { start: 22, end: 24 };
  handoff.roles = [
    {
      ...verse.roles[2]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high"
    }
  ];
  handoff.partGraph = [
    {
      role_id: "lead-vocal",
      is_active: true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [verse, handoff];
  return song;
}

describe("PlayerFeature", () => {
  it("asks the room to analyze first when no song is loaded", () => {
    render(<PlayerFeature title="Player" />);
    expect(
      screen.getByText("Analyze tonight's song first, then hear the first handoff from this player.")
    ).toBeTruthy();
  });

  it("keeps the handoff hear action unavailable without a player playback callback", () => {
    render(<PlayerFeature title="Player" song={songWithHandoff()} />);

    expect(screen.queryByRole("button", { name: "Hear Lead Vocal pass at 0:22" })).toBeNull();
    expect(screen.getByText("Lead Vocal passes the handoff at 0:22.")).toBeTruthy();
  });

  it("delegates the handoff hear action to the owning player callback", () => {
    const onPlayFromSeconds = vi.fn();
    render(<PlayerFeature title="Player" song={songWithHandoff()} onPlayFromSeconds={onPlayFromSeconds} />);

    fireEvent.click(screen.getByRole("button", { name: "Hear Lead Vocal pass at 0:22" }));

    expect(onPlayFromSeconds).toHaveBeenCalledTimes(1);
    expect(onPlayFromSeconds).toHaveBeenCalledWith(22);
  });

  it("renders a safe empty summary when the runtime section collection is not an array", () => {
    const song = songWithHandoff();
    (song as unknown as { sections: unknown }).sections = null;

    render(<PlayerFeature title="Player" song={song} />);

    expect(screen.getByText("No handoff yet. Stay on tonight's map until a pass is marked.")).toBeTruthy();
    expect(screen.getByText("0 sections")).toBeTruthy();
  });

  it("renders a safe empty summary when the runtime section collection is sparse", () => {
    const song = songWithHandoff();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[1]!;
    song.sections = sparseSections;

    render(<PlayerFeature title="Player" song={song} />);

    expect(screen.getByText("No handoff yet. Stay on tonight's map until a pass is marked.")).toBeTruthy();
    expect(screen.getByText("0 sections")).toBeTruthy();
  });

  it("omits malformed runtime section elements without crashing the player summary", () => {
    const song = songWithHandoff();
    song.sections = [null, song.sections[0]!] as unknown as typeof song.sections;

    render(<PlayerFeature title="Player" song={song} />);

    expect(screen.getByText("1 section")).toBeTruthy();
    expect(screen.getByText("verse")).toBeTruthy();
  });

  it("does not pass an object-valued runtime song title into React copy", () => {
    const song = songWithHandoff();
    (song as unknown as { title: unknown }).title = { unsafe: "not-copy" };

    expect(() => render(<PlayerFeature title="Player" song={song} />)).not.toThrow();
    expect(screen.queryByText("not-copy")).toBeNull();
  });
});

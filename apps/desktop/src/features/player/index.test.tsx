import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it, vi } from "vitest";
import { PlayerFeature } from "./index";

function songWithVerse() {
  const song = createDemoRehearsalSong();
  const seed = song.sections[0]!;
  const verse = structuredClone(seed);
  verse.id = "verse-1";
  verse.label = "verse";
  verse.timeRange = { start: 10, end: 30 };
  verse.roles = [
    {
      ...seed.roles[2]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high"
    }
  ];
  verse.partGraph = [
    {
      role_id: "lead-vocal",
      is_active: true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [verse];
  return song;
}

describe("PlayerFeature", () => {
  it("asks the room to analyze first when no song is loaded", () => {
    render(<PlayerFeature title="Player" />);
    expect(
      screen.getByText("Analyze tonight's song first, then hear the first verse from this player.")
    ).toBeTruthy();
  });

  it("keeps the verse hear action unavailable without a player playback callback", () => {
    render(<PlayerFeature title="Player" song={songWithVerse()} />);

    expect(screen.queryByRole("button", { name: "Hear Lead Vocal verse at 0:10" })).toBeNull();
    expect(screen.getByText("Lead Vocal carries the verse at 0:10.")).toBeTruthy();
  });

  it("delegates the verse hear action to the owning player callback", () => {
    const onPlayFromSeconds = vi.fn();
    render(<PlayerFeature title="Player" song={songWithVerse()} onPlayFromSeconds={onPlayFromSeconds} />);

    fireEvent.click(screen.getByRole("button", { name: "Hear Lead Vocal verse at 0:10" }));

    expect(onPlayFromSeconds).toHaveBeenCalledTimes(1);
    expect(onPlayFromSeconds).toHaveBeenCalledWith(10);
  });

  it("renders a safe empty summary when the runtime section collection is not an array", () => {
    const song = songWithVerse();
    (song as unknown as { sections: unknown }).sections = null;

    render(<PlayerFeature title="Player" song={song} />);

    expect(screen.getByText("No verse yet. Stay on tonight's map until the first verse is labeled.")).toBeTruthy();
    expect(screen.getByText("0 sections")).toBeTruthy();
  });

  it("renders a safe empty summary when the runtime section collection is sparse", () => {
    const song = songWithVerse();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;

    render(<PlayerFeature title="Player" song={song} />);

    expect(screen.getByText("No verse yet. Stay on tonight's map until the first verse is labeled.")).toBeTruthy();
    expect(screen.getByText("0 sections")).toBeTruthy();
  });

  it("omits malformed runtime section elements without crashing the player summary", () => {
    const song = songWithVerse();
    song.sections = [null, song.sections[0]!] as unknown as typeof song.sections;

    render(<PlayerFeature title="Player" song={song} />);

    expect(screen.getByText("1 section")).toBeTruthy();
    expect(screen.getByText("verse")).toBeTruthy();
  });

  it("does not pass an object-valued runtime song title into React copy", () => {
    const song = songWithVerse();
    (song as unknown as { title: unknown }).title = { unsafe: "not-copy" };

    expect(() => render(<PlayerFeature title="Player" song={song} />)).not.toThrow();
    expect(screen.queryByText("not-copy")).toBeNull();
  });
});

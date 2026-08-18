import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { FirstLyricCueCallout } from "./FirstLyricCueCallout";

describe("FirstLyricCueCallout", () => {
  it("names the first lyric cue and arms that action", () => {
    render(<FirstLyricCueCallout song={createDemoRehearsalSong()} />);

    const action = screen.getByRole("button", {
      name: "Hear Lead Vocal enter on “city lights” in the verse at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(screen.getByText(/Start on Lead Vocal in the verse at “city lights” \(0:10\)/)).toBeTruthy();
  });

  it("shows fresh guidance when the first lyric cue changes", () => {
    const initialSong = createDemoRehearsalSong();
    const { rerender } = render(<FirstLyricCueCallout song={initialSong} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Hear Lead Vocal enter on “city lights” in the verse at 0:10"
      })
    );
    expect(screen.getByText(/Start on Lead Vocal in the verse at “city lights” \(0:10\)/)).toBeTruthy();

    const replacementSong = createDemoRehearsalSong();
    replacementSong.id = "demo-song-replacement";
    replacementSong.sections[0]!.roles[2]!.cue.value = "hold on";
    rerender(<FirstLyricCueCallout song={replacementSong} />);

    expect(screen.getByText(/Tonight's first lyric is Lead Vocal in the verse: “hold on” at 0:10/)).toBeTruthy();
  });

  it("keeps placeholder-looking rehearsal data literal", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[2]!.name = "{section}";

    render(<FirstLyricCueCallout song={song} />);

    expect(
      screen.getByRole("button", {
        name: "Hear {section} enter on “city lights” in the verse at 0:10"
      })
    ).toBeTruthy();
  });

  it("tells the room to stay on the map when no lyric exists", () => {
    const song = createDemoRehearsalSong();
    song.sections = [];
    render(<FirstLyricCueCallout song={song} />);
    expect(
      screen.getByText("No lyric cue yet. Stay on tonight's map until a part has words to hear.")
    ).toBeTruthy();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it, vi } from "vitest";
import { FirstLyricCueCallout } from "./FirstLyricCueCallout";

describe("FirstLyricCueCallout", () => {
  it("names the first lyric cue as map navigation, scrolls to its section, and arms that action", () => {
    const target = document.createElement("div");
    target.id = "song-structure-section-verse-1";
    const scrollIntoView = vi.fn();
    Object.defineProperty(target, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });
    document.body.appendChild(target);

    render(<FirstLyricCueCallout song={createDemoRehearsalSong()} />);

    const action = screen.getByRole("button", {
      name: "Open Lead Vocal lyric cue “city lights” in the verse at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Start on Lead Vocal in the verse at “city lights” \(0:10\)/)).toBeTruthy();

    target.remove();
  });

  it("shows fresh guidance when the first lyric cue changes or returns later", () => {
    const initialSong = createDemoRehearsalSong();
    const { rerender } = render(<FirstLyricCueCallout song={initialSong} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open Lead Vocal lyric cue “city lights” in the verse at 0:10"
      })
    );
    expect(screen.getByText(/Start on Lead Vocal in the verse at “city lights” \(0:10\)/)).toBeTruthy();

    const replacementSong = createDemoRehearsalSong();
    replacementSong.id = "demo-song-replacement";
    replacementSong.sections[0]!.roles[2]!.cue.value = "hold on";
    rerender(<FirstLyricCueCallout song={replacementSong} />);
    expect(screen.getByText("Lead Vocal enters the verse on “hold on” at 0:10.")).toBeTruthy();

    rerender(<FirstLyricCueCallout song={initialSong} />);
    expect(screen.getByText("Lead Vocal enters the verse on “city lights” at 0:10.")).toBeTruthy();
  });

  it("keeps placeholder-looking rehearsal data literal", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[2]!.name = "{section}";

    render(<FirstLyricCueCallout song={song} />);

    expect(
      screen.getByRole("button", {
        name: "Open {section} lyric cue “city lights” in the verse at 0:10"
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
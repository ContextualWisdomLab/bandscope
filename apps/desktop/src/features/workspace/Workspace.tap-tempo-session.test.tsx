import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Workspace } from "./Workspace";

function EditableWorkspace({ initialSong }: { initialSong: RehearsalSong }) {
  const [song, setSong] = useState(initialSong);
  return <Workspace song={song} onSongUpdate={setSong} />;
}

describe("Workspace tap-tempo session ownership", () => {
  it("resets session taps when a different tempo-less song replaces a same-id analysis result", () => {
    const firstSong = createDemoRehearsalSong();
    firstSong.tempo = undefined;
    firstSong.title = "First room song";

    const nextSong = createDemoRehearsalSong();
    nextSong.tempo = undefined;
    nextSong.title = "Second room song";
    expect(nextSong.id).toBe(firstSong.id);

    const { rerender } = render(<Workspace song={firstSong} />);
    fireEvent.click(screen.getByRole("button", { name: /tap the groove to set tonight's tempo/i }));
    expect(screen.getByTestId("tap-lamp-0").className).toContain("bg-amber-300");

    rerender(<Workspace song={nextSong} />);

    expect(screen.getByTestId("tap-lamp-0").className).toContain("bg-white/15");
    expect(screen.getByRole("button", { name: /reset tonight's tap tempo/i })).toBeDisabled();
  });

  it("resets session taps when a distinct loaded song collides on projected identity", () => {
    const firstSong = createDemoRehearsalSong();
    firstSong.tempo = undefined;
    const nextSong = structuredClone(firstSong);
    nextSong.sections[0]!.roles[0]!.harmony.chord = `${nextSong.sections[0]!.roles[0]!.harmony.chord}sus4`;

    expect(nextSong.id).toBe(firstSong.id);
    expect(nextSong.title).toBe(firstSong.title);
    expect(nextSong.sections.map(({ id, timeRange }) => ({ id, timeRange }))).toEqual(
      firstSong.sections.map(({ id, timeRange }) => ({ id, timeRange }))
    );

    const { rerender } = render(<Workspace song={firstSong} />);
    fireEvent.click(screen.getByRole("button", { name: /tap the groove to set tonight's tempo/i }));
    expect(screen.getByTestId("tap-lamp-0").className).toContain("bg-amber-300");

    rerender(<Workspace song={nextSong} />);

    expect(screen.getByTestId("tap-lamp-0").className).toContain("bg-white/15");
    expect(screen.getByRole("button", { name: /reset tonight's tap tempo/i })).toBeDisabled();
  });

  it("preserves session taps when the supported chord editor updates the current song", () => {
    const song = createDemoRehearsalSong();
    song.tempo = undefined;
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("Dm7");

    render(<EditableWorkspace initialSong={song} />);
    fireEvent.click(screen.getByRole("button", { name: /tap the groove to set tonight's tempo/i }));
    expect(screen.getByTestId("tap-lamp-0").className).toContain("bg-amber-300");

    fireEvent.click(screen.getAllByRole("button", { name: /edit chord for/i })[0]!);

    expect(prompt).toHaveBeenCalled();
    expect(screen.getByTestId("tap-lamp-0").className).toContain("bg-amber-300");
    prompt.mockRestore();
  });
});

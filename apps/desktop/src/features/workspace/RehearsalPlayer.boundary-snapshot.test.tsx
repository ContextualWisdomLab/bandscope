import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it, vi } from "vitest";
import { RehearsalPlayer } from "./RehearsalPlayer";

describe("RehearsalPlayer boundary snapshot", () => {
  it("rejects a stale boundary edit and restores the admitted loop value", () => {
    const song = createDemoRehearsalSong();
    const onSongUpdate = vi.fn();

    render(<RehearsalPlayer song={song} onSongUpdate={onSongUpdate} />);

    const start = screen.getByRole("spinbutton", {
      name: "Start time (seconds)",
    });
    expect(start).toHaveValue(10);

    fireEvent.change(start, { target: { value: "12" } });
    song.sections[0]!.timeRange.start = 11;
    fireEvent.blur(start);

    expect(onSongUpdate).not.toHaveBeenCalled();
    expect(start).toHaveValue(10);
    expect(start).toHaveAttribute("aria-invalid", "true");
  });
});

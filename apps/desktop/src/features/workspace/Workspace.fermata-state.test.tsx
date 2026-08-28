import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "./Workspace";

const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView"
);

function analyzedSongWithFermataPlan(): RehearsalSong {
  const song = createDemoRehearsalSong();
  song.id = "analyzed-song";
  const verse = song.sections[0]!;
  verse.partGraph = verse.partGraph.map((node) => ({ ...node, is_active: true }));
  const vocal = verse.roles.find((role) => role.id === "lead-vocal")!;
  vocal.fermataPlan =
    "Hold this part through the extra 1 s; wait for the cutoff before the next entrance.";
  vocal.fermataPlanSource = "model";
  return song;
}

describe("Workspace fermata state authority", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn()
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalScrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
  });

  it("keeps an opened fermata armed after an immutable practice-progress update", () => {
    const song = analyzedSongWithFermataPlan();
    let updatedSong: RehearsalSong | null = null;
    const onSongUpdate = vi.fn((nextSong: RehearsalSong) => {
      updatedSong = nextSong;
    });
    const { rerender } = render(<Workspace song={song} onSongUpdate={onSongUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal fermata at 0:10" }));
    expect(
      screen.getByText(/Hold Lead Vocal together at 0:10 until the cutoff./)
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Lead Vocal" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase progress" }));
    expect(updatedSong).not.toBeNull();

    rerender(<Workspace song={updatedSong!} onSongUpdate={onSongUpdate} />);

    expect(
      screen.getByText(/Hold Lead Vocal together at 0:10 until the cutoff./)
    ).toBeTruthy();
  });
});

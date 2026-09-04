import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "./Workspace";

const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView"
);

function analyzedSongWithAccelerandoPlan(): RehearsalSong {
  const song = createDemoRehearsalSong();
  song.id = "analyzed-song";
  const verse = song.sections[0]!;
  verse.partGraph = verse.partGraph.map((node) => ({ ...node, is_active: true }));
  const vocal = verse.roles.find((role) => role.id === "lead-vocal")!;
  vocal.accelerandoPlan =
    "Push this part from 80 BPM into 120 BPM; let the next downbeat arrive sooner.";
  vocal.accelerandoPlanSource = "model";
  return song;
}

describe("Workspace accelerando state authority", () => {
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

  it("keeps an opened accel armed after an immutable edit and role switch", () => {
    const song = analyzedSongWithAccelerandoPlan();
    let updatedSong: RehearsalSong | null = null;
    const onSongUpdate = vi.fn((nextSong: RehearsalSong) => {
      updatedSong = nextSong;
    });
    const { rerender } = render(<Workspace song={song} onSongUpdate={onSongUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal accel at 0:10" }));
    expect(
      screen.getByText(/Lift Lead Vocal together at 0:10 so the faster landing is audible\./)
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Lead Vocal" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase progress" }));
    expect(updatedSong).not.toBeNull();

    rerender(<Workspace song={updatedSong!} onSongUpdate={onSongUpdate} />);

    expect(
      screen.getByText(/Lift Lead Vocal together at 0:10 so the faster landing is audible\./)
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));

    expect(
      screen.getByText(/Lift Lead Vocal together at 0:10 so the faster landing is audible\./)
    ).toBeTruthy();
  });

  it("resets armed guidance when a new song arrives", () => {
    const song = analyzedSongWithAccelerandoPlan();
    const nextSong = structuredClone(song);
    const { rerender } = render(<Workspace song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal accel at 0:10" }));
    expect(
      screen.getByText(/Lift Lead Vocal together at 0:10 so the faster landing is audible\./)
    ).toBeTruthy();

    rerender(<Workspace song={nextSong} />);

    expect(screen.getByText("Lead Vocal lifts the verse at 0:10.")).toBeTruthy();
  });
});

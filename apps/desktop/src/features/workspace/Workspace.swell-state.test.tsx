import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "./Workspace";

const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView"
);

function analyzedSongWithSwellPlan(): RehearsalSong {
  const song = createDemoRehearsalSong();
  song.id = "analyzed-song";
  const verse = song.sections[0]!;
  verse.partGraph = [
    { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
    { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
    { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
  ];

  const chorus = structuredClone(verse);
  chorus.id = "chorus-swell-state";
  chorus.label = "chorus";
  chorus.timeRange = { start: verse.timeRange.end, end: verse.timeRange.end + 16 };
  chorus.partGraph = [
    { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
    { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
    { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
  ];
  const vocal = chorus.roles.find((role) => role.id === "lead-vocal")!;
  vocal.swellPlan = "Swell this part; grow into the next downbeat.";
  vocal.swellPlanSource = "model";
  song.sections = [verse, chorus];
  return song;
}

describe("Workspace swell state authority", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn()
    });
  });

  afterEach(() => {
    if (originalScrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
  });

  it("keeps an opened swell armed after an immutable practice-progress update", () => {
    const song = analyzedSongWithSwellPlan();
    let updatedSong: RehearsalSong | null = null;
    const onSongUpdate = vi.fn((nextSong: RehearsalSong) => {
      updatedSong = nextSong;
    });
    const { rerender } = render(<Workspace song={song} onSongUpdate={onSongUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal swell at 0:30" }));
    expect(screen.getByText(/Swell Lead Vocal together at 0:30 so the lift is audible\./)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Lead Vocal" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase progress" }));
    expect(updatedSong).not.toBeNull();

    rerender(<Workspace song={updatedSong!} onSongUpdate={onSongUpdate} />);

    expect(screen.getByText(/Swell Lead Vocal together at 0:30 so the lift is audible\./)).toBeTruthy();
  });
});

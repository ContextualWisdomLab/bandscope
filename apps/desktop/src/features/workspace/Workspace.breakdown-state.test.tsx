import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it, vi } from "vitest";
import { Workspace } from "./Workspace";

function analyzedSongWithBreakdownPlan(): RehearsalSong {
  const song = createDemoRehearsalSong();
  song.id = "analyzed-song";
  const verse = song.sections[0]!;
  verse.partGraph = [
    { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
    { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
    { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
  ];

  const chorus = structuredClone(verse);
  chorus.id = "chorus-breakdown-state";
  chorus.label = "chorus";
  chorus.timeRange = { start: verse.timeRange.end, end: verse.timeRange.end + 16 };
  chorus.partGraph = [
    { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
    { role_id: "keys-right", is_active: false, handoff_to: [], handoff_from: [] },
    { role_id: "lead-vocal", is_active: false, handoff_to: [], handoff_from: [] }
  ];
  const bass = chorus.roles.find((role) => role.id === "bass-guitar")!;
  bass.breakdownPlan = "Hold this breakdown; keep it sparse until the drop.";
  bass.breakdownPlanSource = "model";
  song.sections = [verse, chorus];
  return song;
}

describe("Workspace breakdown state authority", () => {
  it("keeps an opened breakdown armed after an immutable practice-progress update", () => {
    const song = analyzedSongWithBreakdownPlan();
    let updatedSong: RehearsalSong | null = null;
    const onSongUpdate = vi.fn((nextSong: RehearsalSong) => {
      updatedSong = nextSong;
    });
    const { rerender } = render(<Workspace song={song} onSongUpdate={onSongUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar breakdown at 0:30" }));
    expect(screen.getByText(/Keep Bass Guitar sparse at 0:30 until the drop\./)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase progress" }));
    expect(updatedSong).not.toBeNull();

    rerender(<Workspace song={updatedSong!} onSongUpdate={onSongUpdate} />);

    expect(screen.getByText(/Keep Bass Guitar sparse at 0:30 until the drop\./)).toBeTruthy();
  });
});

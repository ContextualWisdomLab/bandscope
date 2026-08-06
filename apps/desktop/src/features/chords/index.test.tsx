import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RehearsalSong } from "@bandscope/shared-types";
import { ChordsFeature } from "./index";

const mockSong: RehearsalSong = {
  id: "song-1",
  title: "Test Song",
  exportSummary: { format: "cue-sheet", headline: "Test Headline", focusSections: [] },
  sections: [
    {
      id: "sec-1",
      label: "verse",
      groove: "test groove",
      timeRange: { start: 0, end: 10 },
      confidence: { level: "high", reason: "test" },
      partGraph: [],
      roles: [
        {
          id: "role-1",
          name: "Test Role",
          roleType: "instrument",
          harmony: { chord: "Cmaj7", functionLabel: "Tonic", source: "model" },
          cue: { value: "test cue", anchor: "count", confidence: { level: "high", reason: "test" } },
          range: { lowestNote: "C4", highestNote: "C5" },
          confidence: { level: "high", reason: "test" },
          rehearsalPriority: "high",
          simplification: " none ",
          setupNote: "NONE",
          manualOverrides: [],
          overlapWarnings: [],
        },
        {
          id: "role-2",
          name: "Transposed Role",
          roleType: "instrument",
          harmony: { chord: "Dmaj7", functionLabel: "Subdominant", source: "user" },
          cue: { value: "test cue", anchor: "count", confidence: { level: "high", reason: "test" } },
          range: { lowestNote: "D4", highestNote: "D5" },
          confidence: { level: "high", reason: "test" },
          rehearsalPriority: "high",
          simplification: " Simplify strumming pattern ",
          setupNote: " Drop D tuning ",
          manualOverrides: [],
          overlapWarnings: [" Density warning: competing with Bass ", "   "],
          transpositionPlan: "Capo 2nd fret",
        },
      ],
    },
  ],
};

describe("ChordsFeature", () => {
  it("renders empty state without a song", () => {
    render(<ChordsFeature title="Chords" />);
    expect(screen.getByText("No song loaded. Start an analysis to see chord data.")).toBeInTheDocument();
  });

  it("renders chord data for roles", () => {
    render(<ChordsFeature title="Chords" song={mockSong} />);
    expect(screen.getByText("verse")).toBeInTheDocument();
    expect(screen.getByText("Cmaj7")).toBeInTheDocument();
    expect(screen.getByText("Test Role")).toBeInTheDocument();
    expect(screen.getByText("Tonic")).toBeInTheDocument();
  });

  it("renders user badge for user-sourced harmony", () => {
    render(<ChordsFeature title="Chords" song={mockSong} />);
    expect(screen.getByText("(User)")).toBeInTheDocument();
  });

  it("renders transpositionPlan when provided", () => {
    render(<ChordsFeature title="Chords" song={mockSong} />);
    expect(screen.getByText(/Capo 2nd fret/)).toBeInTheDocument();
    expect(screen.getByText(/Transpose:/)).toBeInTheDocument();
  });

  it("renders normalized rehearsal guidance for the intended role", () => {
    render(<ChordsFeature title="Chords" song={mockSong} />);
    const role = screen.getByRole("article", { name: "Transposed Role" });

    expect(within(role).getByText("Drop D tuning")).toBeInTheDocument();
    expect(within(role).getByText("Simplify strumming pattern")).toBeInTheDocument();
    expect(within(role).getByText("Density warning: competing with Bass")).toBeInTheDocument();
    expect(within(role).getByText("Setup:")).toBeInTheDocument();
    expect(within(role).getByText("Simplification:")).toBeInTheDocument();
    expect(within(role).getByText("Overlap warnings:")).toBeInTheDocument();
    expect(within(role).getAllByRole("listitem")).toHaveLength(1);
  });

  it("does not render sentinel or whitespace-only role guidance", () => {
    render(<ChordsFeature title="Chords" song={mockSong} />);
    const role = screen.getByRole("article", { name: "Test Role" });

    expect(within(role).queryByText("Setup:")).not.toBeInTheDocument();
    expect(within(role).queryByText("Simplification:")).not.toBeInTheDocument();
    expect(within(role).queryByText("Overlap warnings:")).not.toBeInTheDocument();
    expect(screen.queryByText(/^none$/i)).not.toBeInTheDocument();
  });
});

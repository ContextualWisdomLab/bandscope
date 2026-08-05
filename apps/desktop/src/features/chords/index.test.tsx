import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ChordsFeature } from "./index";
import type { RehearsalSong } from "@bandscope/shared-types";

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
          simplification: "none",
          setupNote: "none",
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
          simplification: "Simplify strumming pattern",
          setupNote: "Drop D tuning",
          manualOverrides: [],
          overlapWarnings: ["Density warning: competing with Bass"],
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

  it("renders setupNote when provided", () => {
    render(<ChordsFeature title="Chords" song={mockSong} />);
    expect(screen.getByText(/Drop D tuning/)).toBeInTheDocument();
    expect(screen.getAllByText(/Setup:/).length).toBeGreaterThan(0);
  });

  it("renders simplification when provided", () => {
    render(<ChordsFeature title="Chords" song={mockSong} />);
    expect(screen.getByText(/Simplify strumming pattern/)).toBeInTheDocument();
    expect(screen.getAllByText(/Simplification:/).length).toBeGreaterThan(0);
  });

  it("renders overlapWarnings when provided", () => {
    render(<ChordsFeature title="Chords" song={mockSong} />);
    expect(screen.getByText(/Density warning: competing with Bass/)).toBeInTheDocument();
    expect(screen.getByText(/Overlap Warning:/)).toBeInTheDocument();
  });
});

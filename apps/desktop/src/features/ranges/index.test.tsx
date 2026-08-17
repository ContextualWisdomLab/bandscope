import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { RangesFeature } from "./index";
import type { RehearsalSong } from "@bandscope/shared-types";

const mockSong: RehearsalSong = {
  id: "song-1",
  title: "Test Song",
  exportSummary: { format: "cue-sheet", headline: "Test Headline", focusSections: [] },
  sections: [
    {
      id: "sec-1",
      label: "chorus",
      groove: "test groove",
      timeRange: { start: 0, end: 10 },
      confidence: { level: "high", reason: "test" },
      partGraph: [],
      roles: [
        {
          id: "role-1",
          name: "Test Role 1",
          roleType: "instrument",
          harmony: { chord: "Cmaj7", functionLabel: "Tonic", source: "model" },
          cue: { value: "test cue", anchor: "count", confidence: { level: "high", reason: "test" } },
          range: { lowestNote: "C4", highestNote: "C5" },
          confidence: { level: "high", reason: "test" },
          rehearsalPriority: "high",
          simplification: "none",
          setupNote: "none",
          manualOverrides: [],
          overlapWarnings: ["Clashing notes with Role 2"],
          transcription: [
            { pitch: "C4", onset: 0, offset: 1, velocity: 100 },
            { pitch: "E4", onset: 1, offset: 2, velocity: 100 },
          ],
        },
        {
          id: "role-2",
          name: "Test Role 2",
          roleType: "instrument",
          harmony: { chord: "Cmaj7", functionLabel: "Tonic", source: "model" },
          cue: { value: "test cue", anchor: "count", confidence: { level: "high", reason: "test" } },
          range: { lowestNote: "G4", highestNote: "G5" },
          confidence: { level: "high", reason: "test" },
          rehearsalPriority: "high",
          simplification: "none",
          setupNote: "none",
          manualOverrides: [],
          overlapWarnings: [],
          // No transcription
        },
      ],
    },
  ],
};

describe("RangesFeature", () => {
  it("renders empty state without a song", () => {
    render(<RangesFeature title="Ranges" />);
    expect(screen.getByText("No song loaded. Start an analysis to see range data.")).toBeInTheDocument();
  });

  it("renders role names and ranges", () => {
    render(<RangesFeature title="Ranges" song={mockSong} />);
    expect(screen.getByText("Test Role 1")).toBeInTheDocument();
    expect(screen.getByText("🎵 C4 — C5")).toBeInTheDocument();
    expect(screen.getByText("Test Role 2")).toBeInTheDocument();
    expect(screen.getByText("🎵 G4 — G5")).toBeInTheDocument();
  });

  it("renders overlap warnings", () => {
    render(<RangesFeature title="Ranges" song={mockSong} />);
    expect(screen.getByText("Clashing notes with Role 2")).toBeInTheDocument();
  });

  it("renders transcription count when transcription exists", () => {
    render(<RangesFeature title="Ranges" song={mockSong} />);
    expect(screen.getByText(/Transcription available:/)).toBeInTheDocument();
    expect(screen.getByText(/2 notes/)).toBeInTheDocument();
  });

  it("does not render transcription block when transcription is undefined", () => {
    render(<RangesFeature title="Ranges" song={mockSong} />);
    // There is exactly one transcription block, from Role 1
    const elements = screen.getAllByText(/Transcription available:/);
    expect(elements.length).toBe(1);
  });
});

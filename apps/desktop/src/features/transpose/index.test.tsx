import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RehearsalSong } from "@bandscope/shared-types";
import { TransposeFeature } from "./index";

const mockSong: RehearsalSong = {
  id: "song-1",
  title: "Test Song",
  status: "ready",
  sections: [
    {
      id: "sec-1",
      label: "intro",
      startSeconds: 0,
      endSeconds: 10,
      roles: [
        {
          id: "role-1",
          name: "Guitar",
          range: { lowestNote: "E2", highestNote: "E5" },
          harmony: { chord: "C", functionLabel: "I", source: "model" },
          overlapWarnings: [],
          transcription: [],
          transpositionPlan: "Capo 2"
        },
        {
          id: "role-2",
          name: "Bass",
          range: { lowestNote: "E1", highestNote: "E3" },
          harmony: { chord: "C", functionLabel: "I", source: "model" },
          overlapWarnings: [],
          transcription: []
        }
      ]
    }
  ]
};

describe("TransposeFeature", () => {
  it("renders empty state when no song is provided", () => {
    render(<TransposeFeature title="Transpose" />);
    expect(screen.getByText("Transpose")).toBeInTheDocument();
    expect(screen.getByText("No song loaded. Start an analysis to see transpose data.")).toBeInTheDocument();
  });

  it("renders sections and transpose plans when song is provided", () => {
    render(<TransposeFeature title="Transpose" song={mockSong} />);
    expect(screen.getByText("Transpose")).toBeInTheDocument();
    expect(screen.getByText("intro")).toBeInTheDocument();
    expect(screen.getByText("Guitar")).toBeInTheDocument();
    expect(screen.getByText("Capo 2")).toBeInTheDocument();
  });

  it("does not render roles without transpose plans", () => {
    render(<TransposeFeature title="Transpose" song={mockSong} />);
    expect(screen.queryByText("Bass")).not.toBeInTheDocument();
  });
});

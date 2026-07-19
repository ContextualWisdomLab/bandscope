import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RehearsalSong } from "@bandscope/shared-types";
import { StemLabFeature } from "./index";

const mockSong: RehearsalSong = {
  id: "song-1",
  title: "Test Song",
  status: "ready",
  sections: []
};

describe("StemLabFeature", () => {
  it("renders empty state when no song is provided", () => {
    render(<StemLabFeature title="Stem Lab" />);
    expect(screen.getByText("Stem Lab")).toBeInTheDocument();
    expect(screen.getByText("No song loaded. Start an analysis to use the stem lab.")).toBeInTheDocument();
  });

  it("renders buttons and title when song is provided", () => {
    render(<StemLabFeature title="Stem Lab" song={mockSong} />);
    expect(screen.getByText("Stem Lab")).toBeInTheDocument();
    expect(screen.getByText("Test Song")).toBeInTheDocument();
    expect(screen.getByText("Play Vocals")).toBeInTheDocument();
    expect(screen.getByText("Play Drums")).toBeInTheDocument();
    expect(screen.getByText("Play Bass")).toBeInTheDocument();
    expect(screen.getByText("Play Other")).toBeInTheDocument();
  });
});

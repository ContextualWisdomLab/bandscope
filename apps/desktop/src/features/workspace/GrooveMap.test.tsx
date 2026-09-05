import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GrooveMap } from "./GrooveMap";

describe("GrooveMap", () => {
  it("renders correctly with no notes", () => {
    render(<GrooveMap />);
    expect(screen.getByText(/No bass line transcription yet/i)).toBeInTheDocument();
  });

  it("renders loading state", () => {
    render(<GrooveMap isLoading={true} />);
    expect(screen.getByText(/Checking the bass line/i)).toBeInTheDocument();
  });

  it("renders notes and lanes correctly", () => {
    const notes = [
      { onset: 0, offset: 1.5, pitch: "C4", velocity: 100 },
      { onset: 1.5, offset: 3, pitch: "D4", velocity: 100 },
      { onset: 3, offset: 5, pitch: "C4", velocity: 100 }
    ];
    render(<GrooveMap notes={notes} />);
    expect(screen.getByText("3 notes mapped for rehearsal")).toBeInTheDocument();
    expect(screen.getByText("C4")).toBeInTheDocument();
    expect(screen.getByText("D4")).toBeInTheDocument();
  });
});

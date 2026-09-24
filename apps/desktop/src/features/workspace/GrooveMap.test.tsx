import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GrooveMap } from "./GrooveMap";

describe("GrooveMap", () => {
  it("renders the loading state", () => {
    render(<GrooveMap isLoading={true} />);
    expect(screen.getByText(/Checking the bass line/)).toBeInTheDocument();
  });

  it("renders the empty state when no notes are provided", () => {
    render(<GrooveMap />);
    expect(screen.getByText(/No bass line transcription yet/)).toBeInTheDocument();
  });

  it("renders the empty state when notes array is empty", () => {
    render(<GrooveMap notes={[]} />);
    expect(screen.getByText(/No bass line transcription yet/)).toBeInTheDocument();
  });

  it("renders the notes correctly and verifies width scaling for offsets > 10", () => {
    // We intentionally include a note with an offset > 10s (here 20.00s)
    // to verify that the timeline max scaling adapts correctly, rather than capping at 10.
    const notes = [
      { onset: 0, offset: 1.5, pitch: "E1" },
      { onset: 2, offset: 2.5, pitch: "A1" },
      { onset: 10, offset: 20, pitch: "E1" }, // max offset is 20
    ];

    render(<GrooveMap notes={notes} />);

    // Check main accessible region exists
    expect(screen.getByRole("region", { name: "Bass transcription groove map" })).toBeInTheDocument();

    // Check note blocks are rendered (title attributes match note descriptions)
    expect(screen.getByTitle("E1 (0.00s - 1.50s)")).toBeInTheDocument();
    expect(screen.getByTitle("A1 (2.00s - 2.50s)")).toBeInTheDocument();

    // Verify the large offset note is rendered with the expected left and width attributes.
    // The maxTime should be 20. So onset 10 = 50% left. (20-10) = 10 duration = 50% width.
    const largeNote = screen.getByTitle("E1 (10.00s - 20.00s)");
    expect(largeNote).toHaveStyle({
      left: "50%",
      width: "50%"
    });

    // Check pitches (A1 and E1) are rendered as horizontal lanes
    expect(screen.getByText("A1")).toBeInTheDocument();
    expect(screen.getByText("E1")).toBeInTheDocument();
  });
});

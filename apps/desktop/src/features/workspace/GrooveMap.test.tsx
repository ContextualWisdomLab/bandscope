import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GrooveMap, maximumNoteOffset } from "./GrooveMap";

describe("maximumNoteOffset", () => {
  it("preserves the ten-second floor and finite maximum", () => {
    expect(maximumNoteOffset([])).toBe(10);
    expect(
      maximumNoteOffset([
        { onset: 0, offset: 1.5, pitch: "C4", velocity: 100 },
        { onset: 1.5, offset: 12, pitch: "D4", velocity: 100 }
      ])
    ).toBe(12);
  });

  it("preserves Math.max non-finite semantics until shared admission rejects them", () => {
    expect(
      Number.isNaN(
        maximumNoteOffset([
          { onset: 0, offset: Number.NaN, pitch: "C4", velocity: 100 },
          { onset: 1, offset: 12, pitch: "D4", velocity: 100 }
        ])
      )
    ).toBe(true);
    expect(
      maximumNoteOffset([
        { onset: 0, offset: Number.POSITIVE_INFINITY, pitch: "C4", velocity: 100 }
      ])
    ).toBe(Number.POSITIVE_INFINITY);
  });
});

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

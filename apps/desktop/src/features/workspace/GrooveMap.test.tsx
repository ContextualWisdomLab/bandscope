import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

  it("binds note geometry to an offset beyond the ten-second floor", () => {
    const notes = [
      { onset: 0, offset: 1.5, pitch: "E1", velocity: 100 },
      { onset: 2, offset: 2.5, pitch: "A1", velocity: 100 },
      { onset: 10, offset: 20, pitch: "D1", velocity: 100 }
    ];

    render(<GrooveMap notes={notes} />);

    expect(
      screen.getByRole("region", { name: "Bass transcription groove map" })
    ).toBeInTheDocument();
    expect(screen.getByTitle("E1 (0.00s - 1.50s)")).toBeInTheDocument();
    expect(screen.getByTitle("A1 (2.00s - 2.50s)")).toBeInTheDocument();
    expect(screen.getByTitle("D1 (10.00s - 20.00s)")).toHaveStyle({
      left: "50%",
      width: "50%"
    });
    expect(screen.getByText("A1")).toBeInTheDocument();
    expect(screen.getByText("D1")).toBeInTheDocument();
    expect(screen.getByText("E1")).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GrooveMap } from "./GrooveMap";

describe("GrooveMap", () => {
  it("uses the latest note offset as the timeline maximum when it exceeds the ten-second floor", () => {
    render(
      <GrooveMap
        notes={[
          { pitch: "E2", onset: 10, offset: 20, velocity: 0.8 },
          { pitch: "G2", onset: 2, offset: 12, velocity: 0.7 }
        ]}
      />
    );

    const latestNote = screen.getByTitle("E2 (10.00s - 20.00s)");
    const earlierNote = screen.getByTitle("G2 (2.00s - 12.00s)");

    expect(latestNote.style.left).toBe("50%");
    expect(latestNote.style.width).toBe("50%");
    expect(earlierNote.style.left).toBe("10%");
    expect(earlierNote.style.width).toBe("50%");
  });

  it("retains the ten-second timeline floor when every note ends earlier", () => {
    render(
      <GrooveMap notes={[{ pitch: "A2", onset: 2, offset: 5, velocity: 0.6 }]} />
    );

    const note = screen.getByTitle("A2 (2.00s - 5.00s)");

    expect(note.style.left).toBe("20%");
    expect(note.style.width).toBe("30%");
  });
});

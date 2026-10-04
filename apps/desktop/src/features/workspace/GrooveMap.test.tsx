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

describe("GrooveMap maximum-offset geometry", () => {
  it("uses an offset beyond the ten-second floor for rendered note geometry", () => {
    render(
      <GrooveMap
        roleName="Bass"
        notes={[
          { onset: 0, offset: 5, pitch: "C4", velocity: 100 },
          { onset: 10, offset: 20, pitch: "D4", velocity: 100 }
        ]}
      />
    );

    expect(screen.getByTitle("D4 (10.00s - 20.00s)")).toHaveStyle({
      left: "50%",
      width: "50%"
    });
  });
});

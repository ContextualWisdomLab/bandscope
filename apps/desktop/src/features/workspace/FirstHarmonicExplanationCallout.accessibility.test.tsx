import { render, screen } from "@testing-library/react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { FirstHarmonicExplanationCallout } from "./FirstHarmonicExplanationCallout";

describe("FirstHarmonicExplanationCallout accessibility", () => {
  it("keeps the unavailable callout named by the concise surface label", () => {
    render(<FirstHarmonicExplanationCallout song={null as unknown as RehearsalSong} />);

    expect(screen.getByLabelText("Tonight's first harmonic explanation")).toBeTruthy();
    expect(
      screen.getByText(
        "Nothing still has a harmonic explanation. Stay on tonight's map until a part owns rehearsal-facing harmony copy."
      )
    ).toBeTruthy();
  });
});

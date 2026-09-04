import { render, screen } from "@testing-library/react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { FirstSetupNoteCallout } from "./FirstSetupNoteCallout";

describe("FirstSetupNoteCallout accessibility", () => {
  it("keeps the unavailable callout named by the concise surface label", () => {
    render(<FirstSetupNoteCallout song={null as unknown as RehearsalSong} />);

    expect(screen.getByLabelText("Tonight's first setup note")).toBeTruthy();
    expect(
      screen.getByText(
        "Nothing still has a setup note. Stay on tonight's map until a part owns rehearsal-facing setup copy."
      )
    ).toBeTruthy();
  });
});

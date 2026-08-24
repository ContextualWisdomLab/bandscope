import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { FirstTranspositionPlanCallout } from "./FirstTranspositionPlanCallout";

describe("FirstTranspositionPlanCallout accessibility", () => {
  it("keeps the complementary region name stable when the plan is unavailable", () => {
    const song = createDemoRehearsalSong();
    for (const role of song.sections[0]!.roles) {
      role.transpositionPlan = "";
    }

    render(<FirstTranspositionPlanCallout song={song} />);

    expect(
      screen.getByRole("complementary", {
        name: "Tonight's first transpose plan"
      })
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Nothing still has a transpose plan. Stay on tonight's map until a part owns rehearsal-facing transpose copy."
      )
    ).toBeTruthy();
  });
});

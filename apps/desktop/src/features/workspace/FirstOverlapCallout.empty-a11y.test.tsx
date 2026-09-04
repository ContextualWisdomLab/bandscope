import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { FirstOverlapCallout } from "./FirstOverlapCallout";

describe("FirstOverlapCallout empty accessible name", () => {
  it("keeps the same concise region name while unavailable guidance remains visible", () => {
    const song = createDemoRehearsalSong();
    for (const role of song.sections[0]!.roles) {
      role.overlapWarnings = ["   "];
    }

    render(<FirstOverlapCallout song={song} />);

    expect(screen.getByLabelText("Tonight's first overlap")).toBeTruthy();
    expect(
      screen.getByText("No overlap yet. Stay on tonight's map until a part names a clash.")
    ).toBeTruthy();
    expect(
      screen.queryByLabelText("No overlap yet. Stay on tonight's map until a part names a clash.")
    ).toBeNull();
  });
});

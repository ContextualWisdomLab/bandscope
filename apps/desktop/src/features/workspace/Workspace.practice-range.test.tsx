import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { Workspace } from "./Workspace";

describe("Workspace practice guidance with unavailable ranges", () => {
  it("shows the range-recovery copy without an impossible start instruction", () => {
    const song = createDemoRehearsalSong();
    song.sections = song.sections.map((section) => ({
      ...section,
      roles: section.roles.map((role) =>
        role.id === "bass-guitar"
          ? { ...role, range: { lowestNote: "", highestNote: "" } }
          : role
      )
    }));

    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));

    expect(
      screen.getByText(
        "Tonight's first range still needs an ear check. Confirm the high and low notes on the selected part before the first section."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Check Bass Guitar's first range, then mark this part started.")
    ).not.toBeInTheDocument();
  });
});

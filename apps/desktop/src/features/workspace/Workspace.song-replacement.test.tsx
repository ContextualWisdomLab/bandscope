import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { Workspace } from "./Workspace";

describe("Workspace song replacement", () => {
  it("clears stale role details when the replacement song has no roles", () => {
    const song = createDemoRehearsalSong();
    const { rerender } = render(<Workspace song={song} />);

    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));
    expect(screen.getByText("Stem Player")).toBeTruthy();

    const replacementSong = createDemoRehearsalSong();
    replacementSong.id = "replacement-without-roles";
    for (const section of replacementSong.sections) {
      section.roles = [];
    }

    rerender(
      <Workspace
        song={replacementSong}
        requestedSurface="transpose"
        requestedSurfaceRequestId={1}
      />
    );

    expect(document.querySelectorAll("#workspace-surface-transpose")).toHaveLength(1);
    expect(screen.queryByText("Stem Player")).toBeNull();
    expect(document.getElementById("workspace-surface-transpose")).toHaveFocus();
  });
});

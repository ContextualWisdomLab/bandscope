import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { Workspace } from "./Workspace";

describe("Workspace role state across song replacement", () => {
  it("clears a selected role when the replacement song has no role evidence", () => {
    const song = createDemoRehearsalSong();
    const seedRole = song.sections[0]!.roles[0]!;
    const roleBearingSong = {
      ...song,
      sections: song.sections.map((section, index) => ({
        ...section,
        roles: index === 0 ? [{ ...seedRole, id: "stale-role", name: "Stale Role" }] : []
      }))
    };
    const noRoleSong = {
      ...roleBearingSong,
      id: "replacement-no-role-song",
      sections: roleBearingSong.sections.map((section) => ({ ...section, roles: [] }))
    };

    const { rerender } = render(<Workspace song={roleBearingSong} />);
    fireEvent.click(screen.getByRole("tab", { name: "Stale Role" }));
    expect(screen.getByText("Stem Player")).toBeTruthy();

    rerender(<Workspace song={noRoleSong} />);

    expect(document.querySelectorAll("#workspace-surface-transpose")).toHaveLength(1);
    expect(screen.queryByText("Stem Player")).toBeNull();
    expect(screen.queryByText("Stale Role")).toBeNull();
    expect(screen.getByText(/No role details are available yet/i)).toBeTruthy();
  });
});

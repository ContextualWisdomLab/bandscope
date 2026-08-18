import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { GrooveMap } from "./GrooveMap";
import { Workspace } from "./Workspace";

/** Replace every copy of one rehearsal role so cross-section aggregation stays deterministic. */
function replaceRole(song: ReturnType<typeof createDemoRehearsalSong>, roleId: string, replace: (role: (typeof song.sections)[number]["roles"][number]) => (typeof song.sections)[number]["roles"][number]) {
  song.sections = song.sections.map((section) => ({
    ...section,
    roles: section.roles.map((role) => (role.id === roleId ? replace(role) : role))
  }));
}

describe("Workspace review regressions", () => {
  it("labels a non-bass groove map by role, keeps keyboard focus visible, and emits one entrance anchor", () => {
    render(
      <GrooveMap
        roleName="Lead Guitar"
        entranceOnset={1}
        notes={[
          { pitch: "E4", onset: 1, offset: 1.5, velocity: 0.8 },
          { pitch: "G4", onset: 1, offset: 1.5, velocity: 0.75 }
        ]}
      />
    );

    const region = screen.getByRole("region", { name: "Lead Guitar transcription groove map" });
    expect(region.className).toContain("focus-visible:ring-2");
    expect(document.querySelectorAll("#workspace-groove-entrance")).toHaveLength(1);
    expect(screen.getAllByTitle(/Tonight's entrance/)).toHaveLength(2);
  });

  it("uses the selected role name in groove-map empty and loading copy", () => {
    const { rerender } = render(<GrooveMap roleName="Lead Guitar" notes={[]} />);
    expect(screen.getByText("No Lead Guitar transcription yet. Use it when you want to check the groove before rehearsal.")).toBeTruthy();

    rerender(<GrooveMap roleName="Lead Guitar" notes={[]} isLoading />);
    expect(screen.getByText("Checking the Lead Guitar line... 45%")).toBeTruthy();
  });

  it("keeps range-backed setup available when no exact first note exists", () => {
    const song = createDemoRehearsalSong();
    const roleId = song.sections[0]!.roles[0]!.id;
    replaceRole(song, roleId, (role) => ({
      ...role,
      setupNote: "Tune down a whole step.",
      transcription: undefined,
      range: {
        ...role.range,
        lowestNote: "C#2",
        highestNote: "E3"
      }
    }));

    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: song.sections[0]!.roles[0]!.name }));

    const setupButton = screen.getByRole("button", { name: /then start in C#2–E3/i });
    expect(setupButton).toBeEnabled();
  });

  it("natively disables setup when a cue has neither an entrance nor a playable range", () => {
    const song = createDemoRehearsalSong();
    const roleId = song.sections[0]!.roles[0]!.id;
    replaceRole(song, roleId, (role) => ({
      ...role,
      setupNote: "Tune down a whole step.",
      transcription: undefined,
      range: {
        ...role.range,
        lowestNote: " ",
        highestNote: " "
      }
    }));

    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: song.sections[0]!.roles[0]!.name }));

    const setupButton = screen.getByRole("button", {
      name: "No first entrance or playable range yet. Stay on tonight's map."
    });
    expect(setupButton).toBeDisabled();
  });
});

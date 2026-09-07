import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps copy interpolation free of dynamically constructed regular expressions", () => {
    const source = readFileSync(resolve(process.cwd(), "src/features/workspace/Workspace.tsx"), "utf8");
    expect(source).not.toContain("new RegExp(");
  });

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

  it("localizes GrooveMap states and the unavailable loop control", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const roleName = song.sections[0]!.roles[0]!.name;
    const { rerender } = render(<GrooveMap roleName={roleName} notes={[]} />);

    expect(screen.getByText(`${roleName} 채보가 아직 없습니다. 합주 전에 그루브를 확인할 때 사용하세요.`)).toBeTruthy();

    rerender(<GrooveMap roleName={roleName} notes={[]} isLoading />);
    expect(screen.getByText(`${roleName} 파트를 확인하는 중... 45%`)).toBeTruthy();
    expect(screen.getByRole("button", { name: "취소" })).toBeTruthy();

    rerender(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: roleName }));
    expect(screen.getByRole("button", { name: /구간 반복/ })).toHaveTextContent("구간 반복");
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
    const visibleLabel = setupButton.textContent?.trim() ?? "";
    expect(visibleLabel).not.toBe("");
    expect(setupButton.getAttribute("aria-label")).toContain(visibleLabel);
  });

  it("keeps placeholder-looking role names literal in setup copy", () => {
    const song = createDemoRehearsalSong();
    const roleId = song.sections[0]!.roles[0]!.id;
    replaceRole(song, roleId, (role) => ({
      ...role,
      name: "{low}",
      setupNote: "Tune down a whole step.",
      transcription: undefined,
      range: {
        ...role.range,
        lowestNote: "C#2",
        highestNote: "E3"
      }
    }));

    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: "{low}" }));

    expect(
      screen.getByRole("button", {
        name: "Set up {low} · then start in C#2–E3. Setup: Tune down a whole step. Use tonight's map"
      })
    ).toBeEnabled();
  });

  it("keeps disabled stem controls discoverable by their visible labels", () => {
    const song = createDemoRehearsalSong();

    render(<Workspace song={song} />);

    fireEvent.click(screen.getByRole("tab", { name: song.sections[0]!.roles[0]!.name }));
    expect(screen.getByRole("button", { name: /Play stem/ })).toHaveTextContent("Play stem");
    expect(screen.getByRole("button", { name: /Solo \/ mute others/ })).toHaveTextContent(
      "Solo / mute others"
    );
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

  it.each([
    ["none", "none"],
    ["E3", "C#2"],
    ["low", "high"]
  ])("rejects malformed setup range %s–%s", (lowestNote, highestNote) => {
    const song = createDemoRehearsalSong();
    const roleId = song.sections[0]!.roles[0]!.id;
    replaceRole(song, roleId, (role) => ({
      ...role,
      setupNote: "Tune down a whole step.",
      transcription: undefined,
      range: {
        ...role.range,
        lowestNote,
        highestNote
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

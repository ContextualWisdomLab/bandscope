import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstEntranceCallout } from "./FirstEntranceCallout";

function appendSongStructureTarget() {
  const grid = document.createElement("div");
  grid.dataset.testid = "song-structure-grid";
  const target = document.createElement("div");
  const scrollIntoView = vi.fn();
  Object.defineProperty(target, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView
  });
  grid.appendChild(target);
  document.body.appendChild(grid);
  return { grid, scrollIntoView };
}

describe("FirstEntranceCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("names the first entrance as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstEntranceCallout song={createDemoRehearsalSong()} />);

    const action = screen.getByRole("button", {
      name: "Open Bass Guitar entrance in the verse at 0:10"
    });
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Start on Bass Guitar in the verse at 0:10/)).toBeTruthy();

    grid.remove();
  });

  it("does not claim completion when the renderer-owned section target is missing", () => {
    render(<FirstEntranceCallout song={createDemoRehearsalSong()} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open Bass Guitar entrance in the verse at 0:10"
      })
    );

    expect(screen.getByText(/^Bass Guitar enters the verse at 0:10\./)).toBeTruthy();
    expect(screen.queryByText(/Start on Bass Guitar in the verse at 0:10/)).toBeNull();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstEntranceCallout song={song} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open Bass Guitar entrance in the verse at 0:10"
      })
    );
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("shows fresh guidance when the song changes", () => {
    const initialSong = createDemoRehearsalSong();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstEntranceCallout song={initialSong} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open Bass Guitar entrance in the verse at 0:10"
      })
    );
    expect(screen.getByText(/Start on Bass Guitar in the verse at 0:10/)).toBeTruthy();

    const replacementSong = createDemoRehearsalSong();
    replacementSong.id = "demo-song-replacement";
    rerender(<FirstEntranceCallout song={replacementSong} />);

    expect(screen.getByText(/^Bass Guitar enters the verse at 0:10\./)).toBeTruthy();
    grid.remove();
  });

  it("forgets an armed entrance after switching away and back", () => {
    const firstSong = createDemoRehearsalSong();
    const secondSong = createDemoRehearsalSong();
    secondSong.id = "demo-song-second";
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstEntranceCallout song={firstSong} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open Bass Guitar entrance in the verse at 0:10"
      })
    );
    expect(screen.getByText(/Start on Bass Guitar in the verse at 0:10/)).toBeTruthy();

    rerender(<FirstEntranceCallout song={secondSong} />);
    expect(screen.getByText(/^Bass Guitar enters the verse at 0:10\./)).toBeTruthy();

    rerender(<FirstEntranceCallout song={firstSong} />);
    expect(screen.getByText(/^Bass Guitar enters the verse at 0:10\./)).toBeTruthy();
    grid.remove();
  });

  it("keeps placeholder-looking rehearsal data literal", () => {
    const song = createDemoRehearsalSong();
    const bassRole = song.sections[0]!.roles.find((role) => role.id === "bass-guitar");
    if (!bassRole) {
      throw new Error("Demo rehearsal song must include the bass-guitar role.");
    }
    bassRole.name = "{section}";

    render(<FirstEntranceCallout song={song} />);

    expect(
      screen.getByRole("button", {
        name: "Open {section} entrance in the verse at 0:10"
      })
    ).toBeTruthy();
  });

  it("tells the room to stay on the map when no entrance exists", () => {
    const song = createDemoRehearsalSong();
    song.sections = [];
    render(<FirstEntranceCallout song={song} />);
    expect(
      screen.getByText("No first entrance yet. Stay on tonight's map until a section has a part.")
    ).toBeTruthy();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstEntranceCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText("No first entrance yet. Stay on tonight's map until a section has a part.")
    ).toBeTruthy();
  });

  it("localizes the section form label instead of exposing its raw enum in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0]!.name = "베이스 기타";

    render(<FirstEntranceCallout song={song} />);

    expect(screen.getByText(/^베이스 기타이 0:10에 벌스로 들어옵니다\./)).toBeTruthy();
    expect(screen.queryByText(/verse로 들어옵니다/)).toBeNull();
  });
});

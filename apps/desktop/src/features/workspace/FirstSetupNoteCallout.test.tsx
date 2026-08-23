import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstSetupNoteCallout } from "./FirstSetupNoteCallout";

const DEMO_SETUP_NOTE = "Keep the attack short so the verse breathes.";

function songWithSetupNote() {
  return createDemoRehearsalSong();
}

function appendSongStructureTarget(ariaLabel = "Scrollable song structure timeline") {
  const timeline = document.createElement("div");
  timeline.setAttribute("role", "region");
  timeline.setAttribute("aria-label", ariaLabel);
  const grid = document.createElement("div");
  grid.dataset.testid = "song-structure-grid";
  const target = document.createElement("div");
  target.dataset.sectionIndex = "0";
  const scrollIntoView = vi.fn();
  Object.defineProperty(target, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView
  });
  grid.appendChild(target);
  timeline.appendChild(grid);
  document.body.appendChild(timeline);
  return { grid: timeline, scrollIntoView };
}

describe("FirstSetupNoteCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstSetupNoteCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText(
        "Nothing still has a setup note. Stay on tonight's map until a part owns rehearsal-facing setup copy."
      )
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithSetupNote();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstSetupNoteCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Bass Guitar setup at 0:10" })).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same setup signature", () => {
    const firstSong = songWithSetupNote();
    const nextSong = songWithSetupNote();
    for (const song of [firstSong, nextSong]) {
      Object.defineProperty(song, "id", {
        configurable: true,
        enumerable: true,
        get() {
          throw new Error("hostile song id getter");
        }
      });
    }
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstSetupNoteCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar setup at 0:10" }));
    expect(
      screen.getByText(/Lock that setup on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstSetupNoteCallout song={nextSong} />);

    expect(screen.getByText("Bass Guitar still has a setup note in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Lock that setup on Bass Guitar at 0:10 before the room starts./)
    ).toBeNull();

    grid.remove();
  });

  it("preserves armed guidance across immutable edits of the same owned song", () => {
    const song = songWithSetupNote();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstSetupNoteCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar setup at 0:10" }));
    expect(
      screen.getByText(/Lock that setup on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstSetupNoteCallout song={{ ...song }} />);

    expect(
      screen.getByText(/Lock that setup on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();
    expect(screen.queryByText("Bass Guitar still has a setup note in the verse at 0:10.")).toBeNull();

    grid.remove();
  });

  it("does not show another part's setup note under the named holding part", () => {
    const song = songWithSetupNote();
    song.sections[0]!.roles[0]!.setupNote = "";
    song.sections[0]!.roles[0]!.rehearsalPriority = "low";
    song.sections[0]!.roles[1]!.setupNote = "Keep the patch bright enough to stay over the guitars.";
    song.sections[0]!.roles[2]!.setupNote = "Watch the breath before the last line of the verse.";

    render(<FirstSetupNoteCallout song={song} />);

    expect(
      screen.getByText("Keyboard 1 Right Hand still has a setup note in the verse at 0:10.")
    ).toBeTruthy();
    expect(screen.getByText("Keep the patch bright enough to stay over the guitars.")).toBeTruthy();
    expect(screen.queryByText("Watch the breath before the last line of the verse.")).toBeNull();
    expect(screen.queryByText(DEMO_SETUP_NOTE)).toBeNull();
  });

  it("names the first setup note as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstSetupNoteCallout song={songWithSetupNote()} />);

    expect(screen.getByText(DEMO_SETUP_NOTE)).toBeTruthy();
    const action = screen.getByRole("button", {
      name: "Open Bass Guitar setup at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Lock that setup on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    grid.remove();
  });

  it("keeps map navigation stable when the renderer accessible name is localized", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget("스크롤 가능한 곡 구조 타임라인");

    render(<FirstSetupNoteCallout song={songWithSetupNote()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar setup at 0:10" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Lock that setup on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstSetupNoteCallout song={songWithSetupNote()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar setup at 0:10" }));

    expect(screen.getByText("Bass Guitar still has a setup note in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Lock that setup on Bass Guitar at 0:10 before the room starts./)
    ).toBeNull();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithSetupNote();
    song.sections[0]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstSetupNoteCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar setup at 0:10" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("scopes map navigation to the song-structure renderer when another surface reuses an index", () => {
    const decoy = document.createElement("div");
    decoy.dataset.sectionIndex = "0";
    const decoyScrollIntoView = vi.fn();
    Object.defineProperty(decoy, "scrollIntoView", {
      configurable: true,
      value: decoyScrollIntoView
    });
    document.body.appendChild(decoy);
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstSetupNoteCallout song={songWithSetupNote()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar setup at 0:10" }));

    expect(decoyScrollIntoView).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    decoy.remove();
    grid.remove();
  });

  it("shows fresh guidance when the first setup note changes or returns later", () => {
    const initialSong = songWithSetupNote();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstSetupNoteCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar setup at 0:10" }));
    expect(
      screen.getByText(/Lock that setup on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    const nextSong = songWithSetupNote();
    nextSong.id = "next-song";
    nextSong.sections[0]!.timeRange = { start: 20, end: 40 };
    rerender(<FirstSetupNoteCallout song={nextSong} />);
    expect(screen.getByText("Bass Guitar still has a setup note in the verse at 0:20.")).toBeTruthy();

    grid.remove();
  });

  it("keeps an unavailable setup note guidance-only", () => {
    const song = songWithSetupNote();
    for (const role of song.sections[0]!.roles) {
      role.setupNote = "";
    }
    render(<FirstSetupNoteCallout song={song} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText(
        "Nothing still has a setup note. Stay on tonight's map until a part owns rehearsal-facing setup copy."
      )
    ).toBeTruthy();
  });

  it("localizes the setup-note form label instead of exposing its raw enum in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithSetupNote();
    song.sections[0]!.roles[0]!.name = "베이스";

    render(<FirstSetupNoteCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 베이스 파트의 세팅 메모가 있습니다.")).toBeTruthy();
    expect(screen.queryByText(/verse에서/)).toBeNull();
  });

  it("renders the owned setup note as a text node instead of template syntax", () => {
    const song = songWithSetupNote();
    song.sections[0]!.roles[1]!.setupNote = "";
    song.sections[0]!.roles[2]!.setupNote = "";
    song.sections[0]!.roles[0]!.setupNote = "Check {role} at {at}";
    render(<FirstSetupNoteCallout song={song} />);
    expect(screen.getByText("Check {role} at {at}")).toBeTruthy();
    expect(screen.queryByText("Check Bass Guitar at 0:10")).toBeNull();
  });
});

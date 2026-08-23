import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstHarmonicFunctionCallout } from "./FirstHarmonicFunctionCallout";

const DEMO_FUNCTION_LABEL = "vi pedal anchor";

function songWithFunctionLabel() {
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

describe("FirstHarmonicFunctionCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstHarmonicFunctionCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText(
        "Nothing still has a harmonic function. Stay on tonight's map until a part owns rehearsal-facing function copy."
      )
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithFunctionLabel();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstHarmonicFunctionCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Bass Guitar function at 0:10" })).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same function signature", () => {
    const firstSong = songWithFunctionLabel();
    const nextSong = songWithFunctionLabel();
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
    const { rerender } = render(<FirstHarmonicFunctionCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar function at 0:10" }));
    expect(
      screen.getByText(/Lock that function on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstHarmonicFunctionCallout song={nextSong} />);

    expect(screen.getByText("Bass Guitar still has a harmonic function in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Lock that function on Bass Guitar at 0:10 before the room starts./)
    ).toBeNull();

    grid.remove();
  });

  it("preserves armed guidance across immutable edits of the same owned song", () => {
    const song = songWithFunctionLabel();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstHarmonicFunctionCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar function at 0:10" }));
    expect(
      screen.getByText(/Lock that function on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstHarmonicFunctionCallout song={{ ...song }} />);

    expect(
      screen.getByText(/Lock that function on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();
    expect(screen.queryByText("Bass Guitar still has a harmonic function in the verse at 0:10.")).toBeNull();

    grid.remove();
  });

  it("does not show another part's harmonic function under the named holding part", () => {
    const song = songWithFunctionLabel();
    song.sections[0]!.roles[0]!.harmony = { ...song.sections[0]!.roles[0]!.harmony, functionLabel: "" };
    song.sections[0]!.roles[0]!.rehearsalPriority = "low";
    song.sections[0]!.roles[1]!.harmony = {
      ...song.sections[0]!.roles[1]!.harmony,
      functionLabel: "Imaj7 color"
    };
    song.sections[0]!.roles[2]!.harmony = {
      ...song.sections[0]!.roles[2]!.harmony,
      functionLabel: "vi melodic pull"
    };

    render(<FirstHarmonicFunctionCallout song={song} />);

    expect(
      screen.getByText("Keyboard 1 Right Hand still has a harmonic function in the verse at 0:10.")
    ).toBeTruthy();
    expect(screen.getByText("Imaj7 color")).toBeTruthy();
    expect(screen.queryByText("vi melodic pull")).toBeNull();
    expect(screen.queryByText(DEMO_FUNCTION_LABEL)).toBeNull();
  });

  it("names the first harmonic function as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstHarmonicFunctionCallout song={songWithFunctionLabel()} />);

    expect(screen.getByText(DEMO_FUNCTION_LABEL)).toBeTruthy();
    const action = screen.getByRole("button", {
      name: "Open Bass Guitar function at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Lock that function on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    grid.remove();
  });

  it("keeps map navigation stable when the renderer accessible name is localized", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget("스크롤 가능한 곡 구조 타임라인");

    render(<FirstHarmonicFunctionCallout song={songWithFunctionLabel()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar function at 0:10" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Lock that function on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstHarmonicFunctionCallout song={songWithFunctionLabel()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar function at 0:10" }));

    expect(screen.getByText("Bass Guitar still has a harmonic function in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Lock that function on Bass Guitar at 0:10 before the room starts./)
    ).toBeNull();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithFunctionLabel();
    song.sections[0]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstHarmonicFunctionCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar function at 0:10" }));
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

    render(<FirstHarmonicFunctionCallout song={songWithFunctionLabel()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar function at 0:10" }));

    expect(decoyScrollIntoView).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    decoy.remove();
    grid.remove();
  });

  it("shows fresh guidance when the first harmonic function changes or returns later", () => {
    const initialSong = songWithFunctionLabel();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstHarmonicFunctionCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar function at 0:10" }));
    expect(
      screen.getByText(/Lock that function on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    const nextSong = songWithFunctionLabel();
    nextSong.id = "next-song";
    nextSong.sections[0]!.timeRange = { start: 20, end: 40 };
    rerender(<FirstHarmonicFunctionCallout song={nextSong} />);
    expect(screen.getByText("Bass Guitar still has a harmonic function in the verse at 0:20.")).toBeTruthy();

    grid.remove();
  });

  it("keeps an unavailable harmonic function guidance-only", () => {
    const song = songWithFunctionLabel();
    for (const role of song.sections[0]!.roles) {
      role.harmony = { ...role.harmony, functionLabel: "" };
    }
    render(<FirstHarmonicFunctionCallout song={song} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText(
        "Nothing still has a harmonic function. Stay on tonight's map until a part owns rehearsal-facing function copy."
      )
    ).toBeTruthy();
  });

  it("localizes the harmonic-function form label instead of exposing its raw enum in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithFunctionLabel();
    song.sections[0]!.roles[0]!.name = "베이스";

    render(<FirstHarmonicFunctionCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 베이스 파트의 화성 기능이 있습니다.")).toBeTruthy();
    expect(screen.queryByText(/verse에서/)).toBeNull();
  });

  it("renders the owned harmonic function as a text node instead of template syntax", () => {
    const song = songWithFunctionLabel();
    song.sections[0]!.roles[1]!.harmony = { ...song.sections[0]!.roles[1]!.harmony, functionLabel: "" };
    song.sections[0]!.roles[2]!.harmony = { ...song.sections[0]!.roles[2]!.harmony, functionLabel: "" };
    song.sections[0]!.roles[0]!.harmony = {
      ...song.sections[0]!.roles[0]!.harmony,
      functionLabel: "Check {role} at {at}"
    };
    render(<FirstHarmonicFunctionCallout song={song} />);
    expect(screen.getByText("Check {role} at {at}")).toBeTruthy();
    expect(screen.queryByText("Check Bass Guitar at 0:10")).toBeNull();
  });
});

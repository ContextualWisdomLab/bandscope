import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstPartHandoffCallout } from "./FirstPartHandoffCallout";

function songWithPartHandoff() {
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

describe("FirstPartHandoffCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstPartHandoffCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText(
        "Nothing still has a part handoff. Stay on tonight's map until a part owns a rehearsal-facing pass."
      )
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithPartHandoff();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstPartHandoffCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Bass Guitar handoff at 0:10" })).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same handoff signature", () => {
    const firstSong = songWithPartHandoff();
    const nextSong = songWithPartHandoff();
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
    const { rerender } = render(<FirstPartHandoffCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar handoff at 0:10" }));
    expect(
      screen.getByText(/Lock that pass from Bass Guitar to Lead Vocal at 0:10 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstPartHandoffCallout song={nextSong} />);

    expect(screen.getByText("Bass Guitar still hands off to Lead Vocal in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Lock that pass from Bass Guitar to Lead Vocal at 0:10 before the room starts./)
    ).toBeNull();

    grid.remove();
  });

  it("preserves armed guidance across immutable edits of the same owned song", () => {
    const song = songWithPartHandoff();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstPartHandoffCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar handoff at 0:10" }));
    expect(
      screen.getByText(/Lock that pass from Bass Guitar to Lead Vocal at 0:10 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstPartHandoffCallout song={{ ...song }} />);

    expect(
      screen.getByText(/Lock that pass from Bass Guitar to Lead Vocal at 0:10 before the room starts./)
    ).toBeTruthy();
    expect(screen.queryByText("Bass Guitar still hands off to Lead Vocal in the verse at 0:10.")).toBeNull();

    grid.remove();
  });

  it("does not show another part's receiving name under the named giving part", () => {
    const song = songWithPartHandoff();
    song.sections[0]!.partGraph[0]!.handoff_to = ["keys-right"];
    song.sections[0]!.partGraph[1]!.handoff_from = ["bass-guitar"];
    song.sections[0]!.partGraph[2]!.handoff_from = [];

    render(<FirstPartHandoffCallout song={song} />);

    expect(
      screen.getByText("Bass Guitar still hands off to Keyboard 1 Right Hand in the verse at 0:10.")
    ).toBeTruthy();
    expect(screen.queryByText(/Lead Vocal/)).toBeNull();
  });

  it("names the first part handoff as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstPartHandoffCallout song={songWithPartHandoff()} />);

    const action = screen.getByRole("button", {
      name: "Open Bass Guitar handoff at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Lock that pass from Bass Guitar to Lead Vocal at 0:10 before the room starts./)
    ).toBeTruthy();

    grid.remove();
  });

  it("keeps map navigation stable when the renderer accessible name is localized", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget("스크롤 가능한 곡 구조 타임라인");

    render(<FirstPartHandoffCallout song={songWithPartHandoff()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar handoff at 0:10" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Lock that pass from Bass Guitar to Lead Vocal at 0:10 before the room starts./)
    ).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstPartHandoffCallout song={songWithPartHandoff()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar handoff at 0:10" }));

    expect(screen.getByText("Bass Guitar still hands off to Lead Vocal in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Lock that pass from Bass Guitar to Lead Vocal at 0:10 before the room starts./)
    ).toBeNull();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithPartHandoff();
    song.sections[0]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstPartHandoffCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar handoff at 0:10" }));
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

    render(<FirstPartHandoffCallout song={songWithPartHandoff()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar handoff at 0:10" }));

    expect(decoyScrollIntoView).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    decoy.remove();
    grid.remove();
  });

  it("shows fresh guidance when the first part handoff changes or returns later", () => {
    const initialSong = songWithPartHandoff();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstPartHandoffCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar handoff at 0:10" }));
    expect(
      screen.getByText(/Lock that pass from Bass Guitar to Lead Vocal at 0:10 before the room starts./)
    ).toBeTruthy();

    const nextSong = songWithPartHandoff();
    nextSong.id = "next-song";
    nextSong.sections[0]!.timeRange = { start: 20, end: 40 };
    rerender(<FirstPartHandoffCallout song={nextSong} />);
    expect(screen.getByText("Bass Guitar still hands off to Lead Vocal in the verse at 0:20.")).toBeTruthy();

    grid.remove();
  });

  it("keeps an unavailable part handoff guidance-only", () => {
    const song = songWithPartHandoff();
    for (const node of song.sections[0]!.partGraph) {
      node.handoff_to = [];
      node.handoff_from = [];
    }
    render(<FirstPartHandoffCallout song={song} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText(
        "Nothing still has a part handoff. Stay on tonight's map until a part owns a rehearsal-facing pass."
      )
    ).toBeTruthy();
  });

  it("localizes the part-handoff form label instead of exposing its raw enum in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithPartHandoff();
    song.sections[0]!.roles[0]!.name = "베이스";
    song.sections[0]!.roles[2]!.name = "보컬";

    render(<FirstPartHandoffCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 베이스 파트가 보컬 파트로 넘깁니다.")).toBeTruthy();
    expect(screen.queryByText(/verse에서/)).toBeNull();
  });

  it("renders owned role names as text nodes instead of template syntax", () => {
    const song = songWithPartHandoff();
    song.sections[0]!.roles[0]!.name = "Check {from} at {at}";
    render(<FirstPartHandoffCallout song={song} />);
    expect(screen.getByText("Check {from} at {at} still hands off to Lead Vocal in the verse at 0:10.")).toBeTruthy();
    expect(screen.queryByText("Check Bass Guitar at 0:10 still hands off to Lead Vocal in the verse at 0:10.")).toBeNull();
  });
});

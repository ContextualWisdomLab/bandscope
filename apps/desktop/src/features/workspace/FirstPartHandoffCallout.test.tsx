import { fireEvent, render, screen } from "@testing-library/react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstPartHandoffCallout } from "./FirstPartHandoffCallout";
import { createPartHandoffTransitionSong } from "./firstPartHandoff.test-fixture";

function songWithPartHandoff() {
  return createPartHandoffTransitionSong();
}

function appendSongStructureTarget(ariaLabel = "Scrollable song structure timeline") {
  const timeline = document.createElement("div");
  timeline.setAttribute("role", "region");
  timeline.setAttribute("aria-label", ariaLabel);
  const grid = document.createElement("div");
  grid.id = "workspace-song-structure-grid";
  const source = document.createElement("div");
  source.dataset.sectionIndex = "0";
  const target = document.createElement("div");
  target.dataset.sectionIndex = "1";
  const scrollIntoView = vi.fn();
  Object.defineProperty(target, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView
  });
  grid.append(source, target);
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
    expect(screen.getByText(/Lock that pass from Bass Guitar to Lead Vocal at 0:10 before the room starts./)).toBeTruthy();

    rerender(<FirstPartHandoffCallout song={nextSong} />);
    expect(screen.getByText("Bass Guitar still hands off to Lead Vocal in the chorus at 0:10.")).toBeTruthy();
    expect(screen.queryByText(/Lock that pass from Bass Guitar to Lead Vocal at 0:10 before the room starts./)).toBeNull();
    grid.remove();
  });

  it("preserves armed guidance across immutable edits of the same owned song", () => {
    const song = songWithPartHandoff();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstPartHandoffCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar handoff at 0:10" }));
    rerender(<FirstPartHandoffCallout song={{ ...song }} />);

    expect(screen.getByText(/Lock that pass from Bass Guitar to Lead Vocal at 0:10 before the room starts./)).toBeTruthy();
    expect(screen.queryByText("Bass Guitar still hands off to Lead Vocal in the chorus at 0:10.")).toBeNull();
    grid.remove();
  });

  it("uses the destination role name rather than a stale source-role name", () => {
    const song = songWithPartHandoff();
    const source = song.sections[0]!;
    const destination = song.sections[1]!;
    source.partGraph[0]!.handoff_to = ["keys-right"];
    source.partGraph[1]!.role_id = "keys-right";
    source.partGraph[1]!.handoff_from = ["bass-guitar"];
    destination.roles[0] = { ...destination.roles[0]!, id: "keys-right", name: "Keyboard 1 Right Hand" };
    destination.partGraph[1]!.role_id = "keys-right";

    render(<FirstPartHandoffCallout song={song} />);

    expect(screen.getByText("Bass Guitar still hands off to Keyboard 1 Right Hand in the chorus at 0:10.")).toBeTruthy();
    expect(screen.queryByText(/Lead Vocal/)).toBeNull();
  });

  it("opens the destination map section and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();
    render(<FirstPartHandoffCallout song={songWithPartHandoff()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar handoff at 0:10" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Lock that pass from Bass Guitar to Lead Vocal at 0:10 before the room starts./)).toBeTruthy();
    grid.remove();
  });

  it("keeps map navigation stable when the renderer accessible name is localized", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget("스크롤 가능한 곡 구조 타임라인");
    render(<FirstPartHandoffCallout song={songWithPartHandoff()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar handoff at 0:10" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    grid.remove();
  });

  it("does not claim map navigation completed when the destination target is missing", () => {
    render(<FirstPartHandoffCallout song={songWithPartHandoff()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar handoff at 0:10" }));

    expect(screen.getByText("Bass Guitar still hands off to Lead Vocal in the chorus at 0:10.")).toBeTruthy();
    expect(screen.queryByText(/Lock that pass from Bass Guitar to Lead Vocal at 0:10 before the room starts./)).toBeNull();
  });

  it("navigates by renderer-owned destination position instead of untrusted analysis ids", () => {
    const song = songWithPartHandoff();
    song.sections[1]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();
    render(<FirstPartHandoffCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar handoff at 0:10" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    grid.remove();
  });

  it("scopes map navigation to the song-structure renderer when another surface reuses an index", () => {
    const decoy = document.createElement("div");
    decoy.dataset.sectionIndex = "1";
    const decoyScrollIntoView = vi.fn();
    Object.defineProperty(decoy, "scrollIntoView", { configurable: true, value: decoyScrollIntoView });
    document.body.appendChild(decoy);
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstPartHandoffCallout song={songWithPartHandoff()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar handoff at 0:10" }));

    expect(decoyScrollIntoView).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    decoy.remove();
    grid.remove();
  });

  it("shows fresh guidance when the destination timing changes", () => {
    const initialSong = songWithPartHandoff();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstPartHandoffCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar handoff at 0:10" }));

    const nextSong = songWithPartHandoff();
    nextSong.id = "next-song";
    nextSong.sections[1]!.timeRange = { start: 20, end: 40 };
    rerender(<FirstPartHandoffCallout song={nextSong} />);
    expect(screen.getByText("Bass Guitar still hands off to Lead Vocal in the chorus at 0:20.")).toBeTruthy();
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
    expect(screen.getByRole("complementary", { name: "Tonight's first part handoff" })).toBeTruthy();
  });

  it("localizes the destination form label in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithPartHandoff();
    song.sections[0]!.roles[0]!.name = "베이스";
    song.sections[1]!.roles[0]!.name = "보컬";

    render(<FirstPartHandoffCallout song={song} />);
    expect(screen.getByText("0:10 코러스에서 베이스 파트가 보컬 파트로 넘깁니다.")).toBeTruthy();
    expect(screen.queryByText(/chorus에서/)).toBeNull();
  });

  it("renders owned role names as text nodes instead of template syntax", () => {
    const song = songWithPartHandoff();
    song.sections[0]!.roles[0]!.name = "Check {from} at {at}";
    render(<FirstPartHandoffCallout song={song} />);
    expect(screen.getByText("Check {from} at {at} still hands off to Lead Vocal in the chorus at 0:10.")).toBeTruthy();
    expect(screen.queryByText("Check Bass Guitar at 0:10 still hands off to Lead Vocal in the chorus at 0:10.")).toBeNull();
  });
});

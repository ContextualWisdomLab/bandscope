import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstOverlapCallout } from "./FirstOverlapCallout";

function songWithOverlap() {
  return createDemoRehearsalSong();
}

function appendSongStructureTarget() {
  const timeline = document.createElement("div");
  timeline.setAttribute("role", "region");
  timeline.setAttribute("aria-label", "Scrollable song structure timeline");
  const grid = document.createElement("div");
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

describe("FirstOverlapCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstOverlapCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText("No overlap yet. Stay on tonight's map until a part names a clash.")
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithOverlap();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstOverlapCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Bass Guitar overlap at 0:10" })).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same overlap signature", () => {
    const firstSong = songWithOverlap();
    const nextSong = songWithOverlap();
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
    const { rerender } = render(<FirstOverlapCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar overlap at 0:10" }));
    expect(screen.getByText(/Clear the overlap with Bass Guitar at 0:10. Make room for each other./)).toBeTruthy();

    rerender(<FirstOverlapCallout song={nextSong} />);

    expect(screen.getByText("Bass Guitar overlaps in the verse at 0:10.")).toBeTruthy();
    expect(screen.queryByText(/Clear the overlap with Bass Guitar at 0:10. Make room for each other./)).toBeNull();

    grid.remove();
  });

  it("names the first overlap as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstOverlapCallout song={songWithOverlap()} />);

    expect(screen.getByText("Density warning: competing with Keyboard Left Hand in low register.")).toBeTruthy();
    const action = screen.getByRole("button", {
      name: "Open Bass Guitar overlap at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Clear the overlap with Bass Guitar at 0:10. Make room for each other./)).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstOverlapCallout song={songWithOverlap()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar overlap at 0:10" }));

    expect(screen.getByText("Bass Guitar overlaps in the verse at 0:10.")).toBeTruthy();
    expect(screen.queryByText(/Clear the overlap with Bass Guitar at 0:10. Make room for each other./)).toBeNull();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithOverlap();
    song.sections[0]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstOverlapCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar overlap at 0:10" }));
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

    render(<FirstOverlapCallout song={songWithOverlap()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar overlap at 0:10" }));

    expect(decoyScrollIntoView).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    decoy.remove();
    grid.remove();
  });

  it("shows fresh guidance when the first overlap changes or returns later", () => {
    const initialSong = songWithOverlap();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstOverlapCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar overlap at 0:10" }));
    expect(screen.getByText(/Clear the overlap with Bass Guitar at 0:10. Make room for each other./)).toBeTruthy();

    const nextSong = songWithOverlap();
    nextSong.id = "next-song";
    nextSong.sections[0]!.timeRange = { start: 20, end: 40 };
    rerender(<FirstOverlapCallout song={nextSong} />);
    expect(screen.getByText("Bass Guitar overlaps in the verse at 0:20.")).toBeTruthy();

    grid.remove();
  });

  it("keeps an unavailable overlap guidance-only", () => {
    const song = songWithOverlap();
    for (const role of song.sections[0]!.roles) {
      role.overlapWarnings = ["   "];
    }
    render(<FirstOverlapCallout song={song} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText("No overlap yet. Stay on tonight's map until a part names a clash.")
    ).toBeTruthy();
  });

  it("names a band-wide overlap when no part carries it", () => {
    const song = songWithOverlap();
    for (const node of song.sections[0]!.partGraph) {
      node.is_active = false;
    }
    render(<FirstOverlapCallout song={song} />);
    expect(screen.getByRole("button", { name: "Open the first overlap at 0:10" })).toBeTruthy();
    expect(screen.getByText("The band overlaps in the verse at 0:10.")).toBeTruthy();
  });

  it("localizes the overlap form label instead of exposing its raw enum in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithOverlap();
    song.sections[0]!.roles[0]!.name = "베이스 기타";
    song.sections[0]!.roles[1]!.rehearsalPriority = "low";
    song.sections[0]!.roles[2]!.rehearsalPriority = "low";

    render(<FirstOverlapCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 베이스 기타 파트가 겹칩니다.")).toBeTruthy();
    expect(screen.queryByText(/verse에서/)).toBeNull();
  });

  it("renders the owned overlap warning as a text node instead of template syntax", () => {
    const song = songWithOverlap();
    song.sections[0]!.roles[0]!.overlapWarnings = ["Clash {role} at {at}"];
    song.sections[0]!.roles[1]!.overlapWarnings = [];
    song.sections[0]!.roles[2]!.overlapWarnings = [];
    render(<FirstOverlapCallout song={song} />);
    expect(screen.getByText("Clash {role} at {at}")).toBeTruthy();
    expect(screen.queryByText("Clash Bass Guitar at 0:10")).toBeNull();
  });
});

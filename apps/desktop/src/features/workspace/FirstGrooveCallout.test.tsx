import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstGrooveCallout } from "./FirstGrooveCallout";

function songWithGroove() {
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

describe("FirstGrooveCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstGrooveCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText("No groove yet. Stay on tonight's map until a section names the feel.")
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithGroove();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstGrooveCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Bass Guitar groove at 0:10" })).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same groove signature", () => {
    const firstSong = songWithGroove();
    const nextSong = songWithGroove();
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
    const { rerender } = render(<FirstGrooveCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar groove at 0:10" }));
    expect(screen.getByText(/Lock the groove with Bass Guitar at 0:10. Feel it together./)).toBeTruthy();

    rerender(<FirstGrooveCallout song={nextSong} />);

    expect(screen.getByText("Bass Guitar locks the verse groove at 0:10.")).toBeTruthy();
    expect(screen.queryByText(/Lock the groove with Bass Guitar at 0:10. Feel it together./)).toBeNull();

    grid.remove();
  });

  it("names the first groove as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstGrooveCallout song={songWithGroove()} />);

    expect(screen.getByText("Straight eighths with a late snare feel")).toBeTruthy();
    const action = screen.getByRole("button", {
      name: "Open Bass Guitar groove at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Lock the groove with Bass Guitar at 0:10. Feel it together./)).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstGrooveCallout song={songWithGroove()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar groove at 0:10" }));

    expect(screen.getByText("Bass Guitar locks the verse groove at 0:10.")).toBeTruthy();
    expect(screen.queryByText(/Lock the groove with Bass Guitar at 0:10. Feel it together./)).toBeNull();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithGroove();
    song.sections[0]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstGrooveCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar groove at 0:10" }));
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

    render(<FirstGrooveCallout song={songWithGroove()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar groove at 0:10" }));

    expect(decoyScrollIntoView).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    decoy.remove();
    grid.remove();
  });

  it("shows fresh guidance when the first groove changes or returns later", () => {
    const initialSong = songWithGroove();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstGrooveCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar groove at 0:10" }));
    expect(screen.getByText(/Lock the groove with Bass Guitar at 0:10. Feel it together./)).toBeTruthy();

    const nextSong = songWithGroove();
    nextSong.id = "next-song";
    nextSong.sections[0]!.timeRange = { start: 20, end: 40 };
    rerender(<FirstGrooveCallout song={nextSong} />);
    expect(screen.getByText("Bass Guitar locks the verse groove at 0:20.")).toBeTruthy();

    grid.remove();
  });

  it("keeps an unavailable groove guidance-only", () => {
    const song = songWithGroove();
    song.sections[0]!.groove = "   ";
    render(<FirstGrooveCallout song={song} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText("No groove yet. Stay on tonight's map until a section names the feel.")
    ).toBeTruthy();
  });

  it("names a band-wide groove when no part holds it", () => {
    const song = songWithGroove();
    for (const node of song.sections[0]!.partGraph) {
      node.is_active = false;
    }
    render(<FirstGrooveCallout song={song} />);
    expect(screen.getByRole("button", { name: "Open the first groove at 0:10" })).toBeTruthy();
    expect(screen.getByText("The band locks the verse groove at 0:10.")).toBeTruthy();
  });

  it("localizes the groove form label instead of exposing its raw enum in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithGroove();
    song.sections[0]!.roles[0]!.name = "베이스 기타";
    song.sections[0]!.roles[1]!.rehearsalPriority = "low";

    render(<FirstGrooveCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 베이스 기타 파트가 그루브를 맞춥니다.")).toBeTruthy();
    expect(screen.queryByText(/verse에서/)).toBeNull();
  });

  it("renders the owned groove hint as a text node instead of template syntax", () => {
    const song = songWithGroove();
    song.sections[0]!.groove = "Shuffle {role} at {at}";
    render(<FirstGrooveCallout song={song} />);
    expect(screen.getByText("Shuffle {role} at {at}")).toBeTruthy();
    expect(screen.queryByText("Shuffle Bass Guitar at 0:10")).toBeNull();
  });
});

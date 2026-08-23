import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstCountCueCallout } from "./FirstCountCueCallout";

function songWithCount() {
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

describe("FirstCountCueCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstCountCueCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText("No count yet. Stay on tonight's map until a part names the entrance.")
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithCount();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstCountCueCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Keyboard 1 Right Hand count at 0:10" })).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same count signature", () => {
    const firstSong = songWithCount();
    const nextSong = songWithCount();
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
    const { rerender } = render(<FirstCountCueCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Keyboard 1 Right Hand count at 0:10" }));
    expect(screen.getByText(/Catch the count with Keyboard 1 Right Hand at 0:10. Enter together./)).toBeTruthy();

    rerender(<FirstCountCueCallout song={nextSong} />);

    expect(screen.getByText("Keyboard 1 Right Hand counts in the verse at 0:10.")).toBeTruthy();
    expect(screen.queryByText(/Catch the count with Keyboard 1 Right Hand at 0:10. Enter together./)).toBeNull();

    grid.remove();
  });

  it("names the first count as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstCountCueCallout song={songWithCount()} />);

    expect(screen.getByText("Enter on beat 2 after the pickup.")).toBeTruthy();
    const action = screen.getByRole("button", {
      name: "Open Keyboard 1 Right Hand count at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Catch the count with Keyboard 1 Right Hand at 0:10. Enter together./)).toBeTruthy();

    grid.remove();
  });

  it("keeps map navigation stable when the renderer accessible name is localized", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget("스크롤 가능한 곡 구조 타임라인");

    render(<FirstCountCueCallout song={songWithCount()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Keyboard 1 Right Hand count at 0:10" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Catch the count with Keyboard 1 Right Hand at 0:10. Enter together./)).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstCountCueCallout song={songWithCount()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Keyboard 1 Right Hand count at 0:10" }));

    expect(screen.getByText("Keyboard 1 Right Hand counts in the verse at 0:10.")).toBeTruthy();
    expect(screen.queryByText(/Catch the count with Keyboard 1 Right Hand at 0:10. Enter together./)).toBeNull();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithCount();
    song.sections[0]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstCountCueCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Keyboard 1 Right Hand count at 0:10" }));
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

    render(<FirstCountCueCallout song={songWithCount()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Keyboard 1 Right Hand count at 0:10" }));

    expect(decoyScrollIntoView).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    decoy.remove();
    grid.remove();
  });

  it("shows fresh guidance when the first count changes or returns later", () => {
    const initialSong = songWithCount();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstCountCueCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Keyboard 1 Right Hand count at 0:10" }));
    expect(screen.getByText(/Catch the count with Keyboard 1 Right Hand at 0:10. Enter together./)).toBeTruthy();

    const nextSong = songWithCount();
    nextSong.id = "next-song";
    nextSong.sections[0]!.timeRange = { start: 20, end: 40 };
    rerender(<FirstCountCueCallout song={nextSong} />);
    expect(screen.getByText("Keyboard 1 Right Hand counts in the verse at 0:20.")).toBeTruthy();

    grid.remove();
  });

  it("keeps an unavailable count guidance-only", () => {
    const song = songWithCount();
    for (const role of song.sections[0]!.roles) {
      role.cue = { kind: "lyric", value: "city lights" };
    }
    render(<FirstCountCueCallout song={song} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText("No count yet. Stay on tonight's map until a part names the entrance.")
    ).toBeTruthy();
  });

  it("names a band-wide count when no part carries it", () => {
    const song = songWithCount();
    for (const node of song.sections[0]!.partGraph) {
      node.is_active = false;
    }
    const { grid, scrollIntoView } = appendSongStructureTarget();
    render(<FirstCountCueCallout song={song} />);
    const action = screen.getByRole("button", { name: "Open the first count at 0:10" });
    expect(screen.getByText("The band counts in the verse at 0:10.")).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText("Catch the count at 0:10. Enter together.")).toBeTruthy();
    grid.remove();
  });

  it("localizes the count form label instead of exposing its raw enum in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithCount();
    song.sections[0]!.roles[1]!.name = "키보드 오른손";
    song.sections[0]!.roles[0]!.rehearsalPriority = "low";
    song.sections[0]!.roles[2]!.rehearsalPriority = "low";

    render(<FirstCountCueCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 키보드 오른손 파트가 카운트합니다.")).toBeTruthy();
    expect(screen.queryByText(/verse에서/)).toBeNull();
  });

  it("renders the owned count cue as a text node instead of template syntax", () => {
    const song = songWithCount();
    song.sections[0]!.roles[1]!.cue = { kind: "count", value: "Enter {role} at {at}" };
    song.sections[0]!.roles[0]!.cue = { kind: "transition", value: "Hold through the pickup before the downbeat." };
    song.sections[0]!.roles[2]!.cue = { kind: "lyric", value: "city lights" };
    render(<FirstCountCueCallout song={song} />);
    expect(screen.getByText("Enter {role} at {at}")).toBeTruthy();
    expect(screen.queryByText("Enter Keyboard 1 Right Hand at 0:10")).toBeNull();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstTransitionCallout } from "./FirstTransitionCallout";

function songWithTransition() {
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

describe("FirstTransitionCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstTransitionCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText("No transition yet. Stay on tonight's map until a part names the change.")
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithTransition();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstTransitionCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Bass Guitar transition at 0:10" })).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same transition signature", () => {
    const firstSong = songWithTransition();
    const nextSong = songWithTransition();
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
    const { rerender } = render(<FirstTransitionCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar transition at 0:10" }));
    expect(screen.getByText(/Catch the change with Bass Guitar at 0:10. Hold through together./)).toBeTruthy();

    rerender(<FirstTransitionCallout song={nextSong} />);

    expect(screen.getByText("Bass Guitar changes in the verse at 0:10.")).toBeTruthy();
    expect(screen.queryByText(/Catch the change with Bass Guitar at 0:10. Hold through together./)).toBeNull();

    grid.remove();
  });

  it("names the first transition as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstTransitionCallout song={songWithTransition()} />);

    expect(screen.getByText("Hold through the pickup before the downbeat.")).toBeTruthy();
    const action = screen.getByRole("button", {
      name: "Open Bass Guitar transition at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Catch the change with Bass Guitar at 0:10. Hold through together./)).toBeTruthy();

    grid.remove();
  });

  it("keeps map navigation stable when the renderer accessible name is localized", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget("스크롤 가능한 곡 구조 타임라인");

    render(<FirstTransitionCallout song={songWithTransition()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar transition at 0:10" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Catch the change with Bass Guitar at 0:10. Hold through together./)).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstTransitionCallout song={songWithTransition()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar transition at 0:10" }));

    expect(screen.getByText("Bass Guitar changes in the verse at 0:10.")).toBeTruthy();
    expect(screen.queryByText(/Catch the change with Bass Guitar at 0:10. Hold through together./)).toBeNull();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithTransition();
    song.sections[0]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstTransitionCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar transition at 0:10" }));
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

    render(<FirstTransitionCallout song={songWithTransition()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar transition at 0:10" }));

    expect(decoyScrollIntoView).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    decoy.remove();
    grid.remove();
  });

  it("shows fresh guidance when the first transition changes or returns later", () => {
    const initialSong = songWithTransition();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstTransitionCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar transition at 0:10" }));
    expect(screen.getByText(/Catch the change with Bass Guitar at 0:10. Hold through together./)).toBeTruthy();

    const nextSong = songWithTransition();
    nextSong.id = "next-song";
    nextSong.sections[0]!.timeRange = { start: 20, end: 40 };
    rerender(<FirstTransitionCallout song={nextSong} />);
    expect(screen.getByText("Bass Guitar changes in the verse at 0:20.")).toBeTruthy();

    grid.remove();
  });

  it("keeps an unavailable transition guidance-only", () => {
    const song = songWithTransition();
    for (const role of song.sections[0]!.roles) {
      role.cue = { kind: "lyric", value: "city lights" };
    }
    render(<FirstTransitionCallout song={song} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText("No transition yet. Stay on tonight's map until a part names the change.")
    ).toBeTruthy();
  });

  it("names a band-wide transition when no part carries it", () => {
    const song = songWithTransition();
    for (const node of song.sections[0]!.partGraph) {
      node.is_active = false;
    }
    const { grid, scrollIntoView } = appendSongStructureTarget();
    render(<FirstTransitionCallout song={song} />);
    const action = screen.getByRole("button", { name: "Open the first transition at 0:10" });
    expect(screen.getByText("The band changes in the verse at 0:10.")).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText("Catch the change at 0:10. Hold through together.")).toBeTruthy();
    grid.remove();
  });

  it("localizes the transition form label instead of exposing its raw enum in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithTransition();
    song.sections[0]!.roles[0]!.name = "베이스 기타";
    song.sections[0]!.roles[1]!.rehearsalPriority = "low";
    song.sections[0]!.roles[2]!.rehearsalPriority = "low";

    render(<FirstTransitionCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 베이스 기타 파트가 바뀝니다.")).toBeTruthy();
    expect(screen.queryByText(/verse에서/)).toBeNull();
  });

  it("renders the owned transition cue as a text node instead of template syntax", () => {
    const song = songWithTransition();
    song.sections[0]!.roles[0]!.cue = { kind: "transition", value: "Hold {role} at {at}" };
    song.sections[0]!.roles[1]!.cue = { kind: "count", value: "Enter on beat 2 after the pickup." };
    song.sections[0]!.roles[2]!.cue = { kind: "lyric", value: "city lights" };
    render(<FirstTransitionCallout song={song} />);
    expect(screen.getByText("Hold {role} at {at}")).toBeTruthy();
    expect(screen.queryByText("Hold Bass Guitar at 0:10")).toBeNull();
  });
});

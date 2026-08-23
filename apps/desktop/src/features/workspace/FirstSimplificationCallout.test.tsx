import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstSimplificationCallout } from "./FirstSimplificationCallout";

function songWithoutSimplification() {
  const song = createDemoRehearsalSong();
  for (const section of song.sections) {
    for (const role of section.roles) {
      role.simplification = "   ";
    }
  }
  return song;
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

describe("FirstSimplificationCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstSimplificationCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText("No simpler take yet. Stay on tonight's map until a part names an easier pass.")
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = createDemoRehearsalSong();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstSimplificationCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Bass Guitar simpler take at 0:10" })).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same simplification signature", () => {
    const firstSong = createDemoRehearsalSong();
    const nextSong = createDemoRehearsalSong();
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
    const { rerender } = render(<FirstSimplificationCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar simpler take at 0:10" }));
    expect(
      screen.getByText(/Use the simpler take with Bass Guitar at 0:10. Get through it together./)
    ).toBeTruthy();

    rerender(<FirstSimplificationCallout song={nextSong} />);

    expect(screen.getByText("Bass Guitar can play simpler in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Use the simpler take with Bass Guitar at 0:10. Get through it together./)
    ).toBeNull();

    grid.remove();
  });

  it("names the first simpler take as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstSimplificationCallout song={createDemoRehearsalSong()} />);

    expect(screen.getByText("Stay on roots if the chorus entrance gets muddy.")).toBeTruthy();
    const action = screen.getByRole("button", {
      name: "Open Bass Guitar simpler take at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Use the simpler take with Bass Guitar at 0:10. Get through it together./)
    ).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstSimplificationCallout song={createDemoRehearsalSong()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar simpler take at 0:10" }));

    expect(screen.getByText("Bass Guitar can play simpler in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Use the simpler take with Bass Guitar at 0:10. Get through it together./)
    ).toBeNull();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstSimplificationCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar simpler take at 0:10" }));
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

    render(<FirstSimplificationCallout song={createDemoRehearsalSong()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar simpler take at 0:10" }));

    expect(decoyScrollIntoView).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    decoy.remove();
    grid.remove();
  });

  it("shows fresh guidance when the first simpler take changes or returns later", () => {
    const initialSong = createDemoRehearsalSong();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstSimplificationCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar simpler take at 0:10" }));
    expect(
      screen.getByText(/Use the simpler take with Bass Guitar at 0:10. Get through it together./)
    ).toBeTruthy();

    const nextSong = createDemoRehearsalSong();
    nextSong.id = "next-song";
    nextSong.sections[0]!.timeRange = { start: 24, end: 44 };
    rerender(<FirstSimplificationCallout song={nextSong} />);
    expect(screen.getByText("Bass Guitar can play simpler in the verse at 0:24.")).toBeTruthy();

    grid.remove();
  });

  it("keeps an unavailable simpler take guidance-only", () => {
    render(<FirstSimplificationCallout song={songWithoutSimplification()} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText("No simpler take yet. Stay on tonight's map until a part names an easier pass.")
    ).toBeTruthy();
  });

  it("localizes the section form label instead of exposing its raw enum in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0]!.name = "베이스";

    render(<FirstSimplificationCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 베이스 파트가 더 쉽게 칠 수 있습니다.")).toBeTruthy();
    expect(screen.queryByText(/verse에서/)).toBeNull();
  });
});
